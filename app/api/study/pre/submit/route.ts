// app/api/study/pre/submit/route.ts
//
// Enforces (server-side, deterministic):
// - Required questions must be present.
// - Required MULTI_CHOICE must have at least 1 selection.
// - Required TEXT must be non-empty (trimmed).
// - Answer type must match question type.
// - Option IDs must belong to the question.
// - SCALE_NRS must respect configured min/max/step when present.

import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {prisma} from "@/app/lib/prisma";
import {stepToPath} from "@/app/modules/publicStudy/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AnswerSchema = z.discriminatedUnion("type", [
    z.object({questionId: z.string().uuid(), type: z.literal("SCALE_NRS"), numericValue: z.number().int()}),
    z.object({questionId: z.string().uuid(), type: z.literal("SINGLE_CHOICE"), selectedOptionId: z.string().uuid()}),
    z.object({
        questionId: z.string().uuid(),
        type: z.literal("MULTI_CHOICE"),
        selectedOptionIds: z.array(z.string().uuid())
    }),
    z.object({questionId: z.string().uuid(), type: z.literal("TEXT"), textValue: z.string()}),
]);

const BodySchema = z.object({
    answers: z.array(AnswerSchema),
});

function fail400(msg: string) {
    return NextResponse.json({ok: false, error: msg}, {status: 400});
}

export async function POST(req: NextRequest) {
    const auth = await requireStudyParticipant(req);
    if (!auth.ok) return NextResponse.json({ok: false, error: auth.error}, {status: auth.status});
    const p = auth.participant;

    if (p.currentStep !== "PRE_SURVEY") {
        return NextResponse.json(
            {
                ok: false,
                error: "Wrong step.",
                redirectTo: stepToPath(p.accessCode, p.currentStep as any, p.currentTaskNumber),
            },
            {status: 409},
        );
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return fail400("Invalid JSON body.");
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({
            ok: false,
            error: "Validation failed.",
            details: parsed.error.flatten()
        }, {status: 400});
    }

    const now = new Date();

    const template = await prisma.surveyTemplate.findFirst({
        where: {studyId: p.studyId, key: "pre"},
        include: {
            questions: {orderBy: {order: "asc"}, include: {options: {orderBy: {order: "asc"}}}},
        },
    });
    if (!template) return NextResponse.json({ok: false, error: "Template not found."}, {status: 500});

    const instance = await prisma.surveyInstance.findUnique({
        where: {participantId_phase: {participantId: p.id, phase: "PRE"}},
    });
    if (!instance) return NextResponse.json({ok: false, error: "Survey instance not found."}, {status: 500});
    if (instance.submittedAt) return NextResponse.json({ok: false, error: "Survey already submitted."}, {status: 409});

    const answerByQ = new Map(parsed.data.answers.map((a) => [a.questionId, a]));

    // Strong server-side validation against the template:
    for (const q of template.questions) {
        const a = answerByQ.get(q.id);

        // Required must exist
        if (q.required && !a) {
            return fail400(`Missing required answer: ${q.key}`);
        }
        if (!a) continue;

        // Type must match question type
        if (a.type !== q.type) {
            return fail400(`Answer type mismatch for question ${q.key} (expected ${q.type}, got ${a.type}).`);
        }

        // Per-type constraints
        if (a.type === "MULTI_CHOICE") {
            if (q.required && a.selectedOptionIds.length < 1) {
                return fail400(`Select at least one option: ${q.key}`);
            }
            const valid = new Set(q.options.map((o) => o.id));
            for (const optId of a.selectedOptionIds) {
                if (!valid.has(optId)) return fail400(`Invalid option for ${q.key}`);
            }
        }

        if (a.type === "SINGLE_CHOICE") {
            const valid = new Set(q.options.map((o) => o.id));
            if (!valid.has(a.selectedOptionId)) return fail400(`Invalid option for ${q.key}`);
        }

        if (a.type === "TEXT") {
            if (q.required && a.textValue.trim().length === 0) {
                return fail400(`Text is required: ${q.key}`);
            }
        }

        if (a.type === "SCALE_NRS") {
            const min = q.scaleMin ?? null;
            const max = q.scaleMax ?? null;
            const step = q.scaleStep ?? null;

            if (min !== null && a.numericValue < min) return fail400(`Value too small: ${q.key}`);
            if (max !== null && a.numericValue > max) return fail400(`Value too large: ${q.key}`);
            if (min !== null && step !== null) {
                const diff = a.numericValue - min;
                if (diff % step !== 0) return fail400(`Invalid step for ${q.key}`);
            }
        }
    }

    await prisma.$transaction(async (tx) => {
        for (const q of template.questions) {
            const a = answerByQ.get(q.id);
            if (!a) continue;

            if (a.type === "SCALE_NRS") {
                await tx.surveyAnswer.create({
                    data: {
                        surveyInstanceId: instance.id,
                        questionId: q.id,
                        numericValue: a.numericValue,
                        createdAt: now
                    },
                });
            }

            if (a.type === "SINGLE_CHOICE") {
                await tx.surveyAnswer.create({
                    data: {
                        surveyInstanceId: instance.id,
                        questionId: q.id,
                        selectedOptionId: a.selectedOptionId,
                        createdAt: now
                    },
                });
            }

            if (a.type === "TEXT") {
                await tx.surveyAnswer.create({
                    data: {surveyInstanceId: instance.id, questionId: q.id, textValue: a.textValue, createdAt: now},
                });
            }

            if (a.type === "MULTI_CHOICE") {
                const answerRow = await tx.surveyAnswer.create({
                    data: {surveyInstanceId: instance.id, questionId: q.id, createdAt: now},
                });

                // If required, we already ensured >= 1 above.
                if (a.selectedOptionIds.length > 0) {
                    await tx.surveyAnswerOption.createMany({
                        data: a.selectedOptionIds.map((optId) => ({answerId: answerRow.id, optionId: optId})),
                    });
                }
            }
        }

        await tx.surveyInstance.update({where: {id: instance.id}, data: {submittedAt: now}});

        await tx.participant.update({
            where: {id: p.id},
            data: {currentStep: "TASK1_CHAT", currentTaskNumber: 1},
        });
    });

    return NextResponse.json({ok: true, redirectTo: `/study/${p.accessCode}/task/1`});
}
