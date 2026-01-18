// app/api/study/task/[taskNumber]/post/submit/route.ts
//
// Fixes included:
// - TS1355 const assertion issue.
// - Required MULTI_CHOICE must have >= 1 selection (and valid option IDs).
// - Type match + scale min/max/step checks.
//
// PATCH (SidePanel finalization; drop-in, minimal)
// -----------------------------------------------
// - If the user left the side panel open and never sent a CLOSE event,
//   TaskSession.sidePanelOpenMs may remain 0 even though the panel was used.
// - As a safety net, we finalize the latest open SidePanelSpan (closedAt=null) for this TaskSession
//   on post-survey submit as well (idempotent).
// - Best-effort: must never break survey submission.

import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {prisma} from "@/app/lib/prisma";
import {stepToPath} from "@/app/modules/publicStudy/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskNumber = 1 | 2 | 3;

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

const BodySchema = z.object({answers: z.array(AnswerSchema)});

const PHASE_BY_TASK = {1: "TASK1_POST", 2: "TASK2_POST", 3: "TASK3_POST"} as const;
const TEMPLATE_KEY_BY_TASK = {1: "task1_post", 2: "task2_post", 3: "task3_post"} as const;

function postStep(taskNumber: TaskNumber) {
    return `TASK${taskNumber}_POST_SURVEY` as const;
}

function phaseForTask(taskNumber: TaskNumber) {
    return PHASE_BY_TASK[taskNumber];
}

function templateKeyForTask(taskNumber: TaskNumber) {
    return TEMPLATE_KEY_BY_TASK[taskNumber];
}

function fail400(msg: string) {
    return NextResponse.json({ok: false, error: msg}, {status: 400});
}

/**
 * finalizeSidePanelSpansForTaskSession
 * ===================================
 *
 * Same logic as in task/[taskNumber]/ready:
 * - Close the latest open SidePanelSpan (if any) for the given TaskSession.
 * - Book the duration into taskSession.sidePanelOpenMs and increment sidePanelCloseCount.
 *
 * Idempotent:
 * - If no open span exists, return.
 *
 * Best-effort:
 * - If anything fails, the surrounding transaction may continue;
 *   caller should swallow errors (survey submit must not fail due to analytics).
 */
async function finalizeSidePanelSpansForTaskSession(args: {
    tx: any;
    taskSessionId: string;
    now: Date;
}) {
    const {tx, taskSessionId, now} = args;

    const openSpan = await tx.sidePanelSpan.findFirst({
        where: {taskSessionId, closedAt: null},
        orderBy: {openedAt: "desc"},
        select: {id: true, openedAt: true, chatThreadId: true},
    });

    if (!openSpan) return;

    let chatThreadId: string | null = openSpan.chatThreadId ?? null;

    if (!chatThreadId) {
        const latestThread = await tx.chatThread.findFirst({
            where: {taskSessionId},
            orderBy: {createdAt: "desc"},
            select: {id: true},
        });
        chatThreadId = latestThread?.id ?? null;
    }

    const lastMsgSeq = chatThreadId
        ? (
        await tx.chatMessage.findFirst({
            where: {chatThreadId},
            orderBy: {sequence: "desc"},
            select: {sequence: true},
        })
    )?.sequence ?? null
        : null;

    const deltaMs = now.getTime() - openSpan.openedAt.getTime();
    const safeDelta = Number.isFinite(deltaMs) && deltaMs >= 0 ? deltaMs : 0;

    await tx.sidePanelSpan.update({
        where: {id: openSpan.id},
        data: {
            closedAt: now,
            closedAfterMessageSeq: lastMsgSeq,
            ...(openSpan.chatThreadId ? {} : {chatThreadId: chatThreadId ?? null}),
        },
    });

    await tx.taskSession.update({
        where: {id: taskSessionId},
        data: {
            sidePanelCloseCount: {increment: 1},
            sidePanelOpenMs: {increment: BigInt(Math.floor(safeDelta))},
        },
    });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskNumber: string }> }) {
    const auth = await requireStudyParticipant(req);
    if (!auth.ok) return NextResponse.json({ok: false, error: auth.error}, {status: auth.status});
    const p = auth.participant;

    const {taskNumber: raw} = await ctx.params;
    const n = Number(raw);
    if (n !== 1 && n !== 2 && n !== 3) return fail400("Invalid taskNumber.");
    const taskNumber: TaskNumber = n;

    if (p.currentStep !== postStep(taskNumber)) {
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
        where: {studyId: p.studyId, key: templateKeyForTask(taskNumber)},
        include: {questions: {orderBy: {order: "asc"}, include: {options: {orderBy: {order: "asc"}}}}},
    });
    if (!template) return NextResponse.json({ok: false, error: "Template not found."}, {status: 500});

    const phase = phaseForTask(taskNumber);

    const instance = await prisma.surveyInstance.findUnique({
        where: {participantId_phase: {participantId: p.id, phase}},
    });
    if (!instance) return NextResponse.json({ok: false, error: "Survey instance not found."}, {status: 500});
    if (instance.submittedAt) return NextResponse.json({ok: false, error: "Survey already submitted."}, {status: 409});

    const answerByQ = new Map(parsed.data.answers.map((a) => [a.questionId, a]));

    for (const q of template.questions) {
        const a = answerByQ.get(q.id);

        if (q.required && !a) return fail400(`Missing required answer: ${q.key}`);
        if (!a) continue;

        if (a.type !== q.type) return fail400(`Answer type mismatch for question ${q.key}`);

        if (a.type === "MULTI_CHOICE") {
            if (q.required && a.selectedOptionIds.length < 1) return fail400(`Select at least one option: ${q.key}`);
            const valid = new Set(q.options.map((o) => o.id));
            for (const optId of a.selectedOptionIds) if (!valid.has(optId)) return fail400(`Invalid option for ${q.key}`);
        }

        if (a.type === "SINGLE_CHOICE") {
            const valid = new Set(q.options.map((o) => o.id));
            if (!valid.has(a.selectedOptionId)) return fail400(`Invalid option for ${q.key}`);
        }

        if (a.type === "TEXT") {
            if (q.required && a.textValue.trim().length === 0) return fail400(`Text is required: ${q.key}`);
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
                if (a.selectedOptionIds.length > 0) {
                    await tx.surveyAnswerOption.createMany({
                        data: a.selectedOptionIds.map((optId) => ({answerId: answerRow.id, optionId: optId})),
                    });
                }
            }
        }

        await tx.surveyInstance.update({where: {id: instance.id}, data: {submittedAt: now}});

        // Finalize side panel usage (safety net; best-effort).
        // NOTE: This must not fail survey submission; we swallow errors.
        try {
            const taskSession = await tx.taskSession.findUnique({
                where: {participantId_taskNumber: {participantId: p.id, taskNumber}},
                select: {id: true},
            });

            if (taskSession) {
                await finalizeSidePanelSpansForTaskSession({tx, taskSessionId: taskSession.id, now});
            }
        } catch (e) {
            console.error("[task/post/submit] finalize side panel failed (best-effort):", e);
        }

        await tx.taskSession.update({
            where: {participantId_taskNumber: {participantId: p.id, taskNumber}},
            data: {postSurveySubmittedAt: now},
        });

        if (taskNumber < 3) {
            await tx.participant.update({
                where: {id: p.id},
                data: {currentStep: (`TASK${taskNumber + 1}_CHAT`) as any, currentTaskNumber: taskNumber + 1},
            });
        } else {
            await tx.participant.update({
                where: {id: p.id},
                data: {currentStep: "FINAL_SURVEY", currentTaskNumber: null},
            });
        }
    });

    const redirectTo = taskNumber < 3 ? `/study/${p.accessCode}/task/${taskNumber + 1}` : `/study/${p.accessCode}/final`;
    return NextResponse.json({ok: true, redirectTo});
}
