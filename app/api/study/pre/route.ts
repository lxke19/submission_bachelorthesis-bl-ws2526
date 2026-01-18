// app/api/study/pre/route.ts
//
// Purpose:
// - Load PRE survey template/questions/options for the participant.
// - Ensure SurveyInstance exists for phase PRE (race-safe).
//
// Fixes included:
// - Race-safe SurveyInstance ensure (create + swallow P2002 + re-read).
// - Logging for duplicate requests.

import {NextRequest, NextResponse} from "next/server";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {prisma} from "@/app/lib/prisma";
import {stepToPath} from "@/app/modules/publicStudy/routing";
import {randomUUID} from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const rid = randomUUID();
    const started = Date.now();
    console.log(`[study.pre] rid=${rid} start`);

    const auth = await requireStudyParticipant(req);
    if (!auth.ok) {
        console.log(
            `[study.pre] rid=${rid} auth-fail status=${auth.status} error=${auth.error}`,
        );
        return NextResponse.json(
            {ok: false, error: auth.error},
            {status: auth.status},
        );
    }

    const p = auth.participant;

    if (p.currentStep !== "PRE_SURVEY") {
        console.log(
            `[study.pre] rid=${rid} wrong-step participant=${p.id} step=${p.currentStep}`,
        );
        return NextResponse.json(
            {
                ok: false,
                error: "Wrong step.",
                redirectTo: stepToPath(p.accessCode, p.currentStep as any, p.currentTaskNumber),
            },
            {status: 409},
        );
    }

    const template = await prisma.surveyTemplate.findFirst({
        where: {studyId: p.studyId, key: "pre"},
        include: {
            questions: {
                orderBy: {order: "asc"},
                include: {options: {orderBy: {order: "asc"}}},
            },
        },
    });

    if (!template) {
        console.log(`[study.pre] rid=${rid} template-missing studyId=${p.studyId}`);
        return NextResponse.json(
            {ok: false, error: "Pre survey template not found."},
            {status: 500},
        );
    }

    await prisma.$transaction(async (tx) => {
        const existing = await tx.surveyInstance.findUnique({
            where: {participantId_phase: {participantId: p.id, phase: "PRE"}},
            select: {id: true},
        });

        if (!existing) {
            try {
                const created = await tx.surveyInstance.create({
                    data: {
                        participantId: p.id,
                        surveyTemplateId: template.id,
                        phase: "PRE",
                    },
                    select: {id: true},
                });
                console.log(`[study.pre] rid=${rid} created instance=${created.id}`);
            } catch (e: any) {
                if (e?.code !== "P2002") throw e;
                console.log(`[study.pre] rid=${rid} instance P2002 -> ok`);
            }
        }
    });

    console.log(
        `[study.pre] rid=${rid} ok participant=${p.id} ms=${Date.now() - started}`,
    );

    return NextResponse.json({
        ok: true,
        phase: "PRE",
        title: template.name,
        questions: template.questions.map((q) => ({
            id: q.id,
            key: q.key,
            text: q.text,
            type: q.type,
            required: q.required,
            order: q.order,
            scaleMin: q.scaleMin,
            scaleMax: q.scaleMax,
            scaleStep: q.scaleStep,
            options: q.options.map((o) => ({
                id: o.id,
                value: o.value,
                label: o.label,
                order: o.order,
            })),
        })),
    });
}
