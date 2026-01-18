// app/api/study/task/[taskNumber]/post/route.ts
//
// Purpose:
// - Load the post-task survey for TASKn_POST.
// - Ensure SurveyInstance exists for phase TASKn_POST.
// - Mark taskSession.postSurveyStartedAt if null.
//
// Fixes included:
// - TS1355: avoid `(cond ? "X" : "Y") as const` on non-literal expressions.
// - Race-safe SurveyInstance ensure (create + swallow P2002 + findUnique).

import {NextRequest, NextResponse} from "next/server";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {prisma} from "@/app/lib/prisma";
import {stepToPath} from "@/app/modules/publicStudy/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskNumber = 1 | 2 | 3;

function postStep(taskNumber: TaskNumber) {
    return `TASK${taskNumber}_POST_SURVEY` as const;
}

const PHASE_BY_TASK = {
    1: "TASK1_POST",
    2: "TASK2_POST",
    3: "TASK3_POST",
} as const;

const TEMPLATE_KEY_BY_TASK = {
    1: "task1_post",
    2: "task2_post",
    3: "task3_post",
} as const;

function phaseForTask(taskNumber: TaskNumber) {
    return PHASE_BY_TASK[taskNumber];
}

function templateKeyForTask(taskNumber: TaskNumber) {
    return TEMPLATE_KEY_BY_TASK[taskNumber];
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ taskNumber: string }> }) {
    const auth = await requireStudyParticipant(req);
    if (!auth.ok) return NextResponse.json({ok: false, error: auth.error}, {status: auth.status});
    const p = auth.participant;

    const {taskNumber: raw} = await ctx.params;
    const n = Number(raw);
    if (n !== 1 && n !== 2 && n !== 3) {
        return NextResponse.json({ok: false, error: "Invalid taskNumber."}, {status: 400});
    }
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

    const template = await prisma.surveyTemplate.findFirst({
        where: {studyId: p.studyId, key: templateKeyForTask(taskNumber)},
        include: {
            questions: {
                orderBy: {order: "asc"},
                include: {options: {orderBy: {order: "asc"}}},
            },
        },
    });
    if (!template) return NextResponse.json({ok: false, error: "Post survey template not found."}, {status: 500});

    const now = new Date();
    const phase = phaseForTask(taskNumber);

    await prisma.$transaction(async (tx) => {
        const taskSession = await tx.taskSession.findUnique({
            where: {participantId_taskNumber: {participantId: p.id, taskNumber}},
            select: {id: true, postSurveyStartedAt: true},
        });

        if (taskSession && !taskSession.postSurveyStartedAt) {
            await tx.taskSession.update({
                where: {id: taskSession.id},
                data: {postSurveyStartedAt: now},
            });
        }

        // Race-safe "ensure instance exists".
        const existing = await tx.surveyInstance.findUnique({
            where: {participantId_phase: {participantId: p.id, phase}},
        });

        if (!existing) {
            try {
                await tx.surveyInstance.create({
                    data: {
                        participantId: p.id,
                        surveyTemplateId: template.id,
                        phase,
                        taskSessionId: taskSession?.id ?? undefined,
                    },
                });
            } catch (e: any) {
                if (e?.code !== "P2002") throw e;
                // already created by concurrent request -> OK
            }
        }
    });

    return NextResponse.json({
        ok: true,
        phase,
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
            options: q.options.map((o) => ({id: o.id, value: o.value, label: o.label, order: o.order})),
        })),
    });
}
