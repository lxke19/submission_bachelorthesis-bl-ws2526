// app/api/study/task/[taskNumber]/route.ts
//
// Purpose:
// - Load task prompt (TaskDefinition) and ensure TaskSession exists.
// - IMPORTANT NOW: Do NOT create ChatThread and do NOT return a langGraphThreadId.
//   We let the AgentChat UI / useStream create the LangGraph thread automatically.
//
// Fixes included:
// - Race-safe ensure TaskSession (no upsert P2002).
// - Minimal structured logging to debug duplicate requests.

import {NextRequest, NextResponse} from "next/server";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {prisma} from "@/app/lib/prisma";
import {stepToPath} from "@/app/modules/publicStudy/routing";
import {randomUUID} from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stepForTaskChat(taskNumber: number) {
    return (`TASK${taskNumber}_CHAT`) as const;
}

function shortAuthHeader(req: NextRequest) {
    const h = req.headers.get("authorization") ?? "";
    if (!h) return "none";
    // don't log token; just show scheme + last 8 chars
    const last = h.slice(-8);
    return `${h.split(" ")[0] ?? "?"}..${last}`;
}

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ taskNumber: string }> },
) {
    const rid = randomUUID();
    const started = Date.now();

    console.log(
        `[study.task] rid=${rid} start url=${req.nextUrl.pathname} auth=${shortAuthHeader(req)}`,
    );

    const auth = await requireStudyParticipant(req);
    if (!auth.ok) {
        console.log(
            `[study.task] rid=${rid} auth-fail status=${auth.status} error=${auth.error}`,
        );
        return NextResponse.json(
            {ok: false, error: auth.error},
            {status: auth.status},
        );
    }

    const p = auth.participant;
    const {taskNumber: raw} = await ctx.params;
    const taskNumber = Number(raw);

    if (![1, 2, 3].includes(taskNumber)) {
        console.log(`[study.task] rid=${rid} invalid taskNumber=${raw}`);
        return NextResponse.json(
            {ok: false, error: "Invalid taskNumber."},
            {status: 400},
        );
    }

    const expectedStep = stepForTaskChat(taskNumber);
    if (p.currentStep !== expectedStep) {
        console.log(
            `[study.task] rid=${rid} wrong-step participant=${p.id} step=${p.currentStep} expected=${expectedStep}`,
        );
        return NextResponse.json(
            {
                ok: false,
                error: "Wrong step.",
                redirectTo: stepToPath(
                    p.accessCode,
                    p.currentStep as any,
                    p.currentTaskNumber,
                ),
            },
            {status: 409},
        );
    }

    const taskDef = await prisma.taskDefinition.findUnique({
        where: {studyId_taskNumber: {studyId: p.studyId, taskNumber}},
    });
    if (!taskDef) {
        console.log(
            `[study.task] rid=${rid} taskDef-missing studyId=${p.studyId} taskNumber=${taskNumber}`,
        );
        return NextResponse.json(
            {ok: false, error: "TaskDefinition not found."},
            {status: 500},
        );
    }

    const now = new Date();

    // Transaction: ensure TaskSession exists + keep participant.currentTaskNumber consistent
    const session = await prisma.$transaction(async (tx) => {
        // Race-safe "ensure"
        let s = await tx.taskSession.findUnique({
            where: {participantId_taskNumber: {participantId: p.id, taskNumber}},
            select: {id: true, chatStartedAt: true},
        });

        if (!s) {
            try {
                s = await tx.taskSession.create({
                    data: {
                        participantId: p.id,
                        taskDefinitionId: taskDef.id,
                        taskNumber,
                        chatbotVariant: p.assignedVariant,
                        chatStartedAt: now, // keep metric
                    },
                    select: {id: true, chatStartedAt: true},
                });
                console.log(
                    `[study.task] rid=${rid} created TaskSession participant=${p.id} taskNumber=${taskNumber} session=${s.id}`,
                );
            } catch (e: any) {
                if (e?.code !== "P2002") throw e;
                // Someone else created it concurrently → re-read
                s = await tx.taskSession.findUnique({
                    where: {participantId_taskNumber: {participantId: p.id, taskNumber}},
                    select: {id: true, chatStartedAt: true},
                });
                console.log(
                    `[study.task] rid=${rid} TaskSession P2002 -> re-read participant=${p.id} taskNumber=${taskNumber} session=${s?.id}`,
                );
            }
        }

        // Set chatStartedAt if null (only first open should stamp it)
        if (s && !s.chatStartedAt) {
            await tx.taskSession.update({
                where: {id: s.id},
                data: {chatStartedAt: now},
            });
        }

        // Keep participant.currentTaskNumber consistent
        await tx.participant.update({
            where: {id: p.id},
            data: {currentTaskNumber: taskNumber},
        });

        return s;
    });

    console.log(
        `[study.task] rid=${rid} ok participant=${p.id} task=${taskNumber} session=${session?.id} ms=${Date.now() - started}`,
    );

    // IMPORTANT: no langGraphThreadId here.
    return NextResponse.json({
        ok: true,
        taskNumber,
        title: taskDef.title,
        promptMarkdown: taskDef.promptMarkdown,
        sidePanelEnabled: p.sidePanelEnabled,
    });
}
