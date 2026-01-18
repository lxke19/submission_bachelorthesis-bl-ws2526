// app/api/study/task/[taskNumber]/ready/route.ts
//
// Purpose:
// - Participant clicks "Ready to answer".
// - End chat phase and move to TASKn_POST_SURVEY.
//
// What is stored/updated:
// - taskSession.readyToAnswerAt
// - taskSession.chatEndedAt
// - participant.currentStep -> TASKn_POST_SURVEY
// - IMPORTANT: close all ACTIVE ChatThreads for this TaskSession as TASK_FINISHED
//
// Why:
// - You want explicit timestamps for duration analytics (no StepRuns).
// - You also want deterministic closure: when chat ends, no ACTIVE threads should remain.
//
// PATCH (TS2737 fix; drop-in, minimal)
// -----------------------------------
// - This project targets < ES2020 in TS config, so BigInt *literals* like `0n` must not appear.
// - This file does NOT need BigInt at all; we ensure there are no `123n` literals anywhere.
// - No behavior changes.
//
// PATCH (SidePanel finalization; drop-in, minimal)
// -----------------------------------------------
// - If the user left the side panel open and never sent a CLOSE event,
//   TaskSession.sidePanelOpenMs would remain 0 even though the panel was used.
// - On "Ready", we finalize the latest open SidePanelSpan (closedAt=null) for this TaskSession:
//   - close it at `now`
//   - increment sidePanelOpenMs by (now - openedAt)
//   - increment sidePanelCloseCount by 1
// - Idempotent: if no open span exists, we no-op.
// - Best-effort: must never break the flow due to analytics logging.

import {NextRequest, NextResponse} from "next/server";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {prisma} from "@/app/lib/prisma";
import {stepToPath} from "@/app/modules/publicStudy/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function chatStep(taskNumber: number) {
    return `TASK${taskNumber}_CHAT`;
}

function postStep(taskNumber: number) {
    return `TASK${taskNumber}_POST_SURVEY`;
}

/**
 * finalizeSidePanelSpansForTaskSession
 * ===================================
 *
 * Closes the latest open SidePanelSpan (if any) for the given TaskSession and books duration.
 *
 * Why here (Ready):
 * - "Ready" defines the end of the chat phase.
 * - If the panel is left open, we still want sidePanelOpenMs to reflect reality.
 *
 * Robustness:
 * - Idempotent: if no open span exists, return.
 * - Best-effort thread/message linking:
 *   - If we can, we attach closedAfterMessageSeq based on the latest ChatThread for this TaskSession.
 *   - If not, we still close span + book ms.
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

    // Best-effort: determine last message seq for the linked thread or latest thread of session.
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
            // IMPORTANT: no BigInt literals; convert number -> BigInt via constructor
            sidePanelOpenMs: {increment: BigInt(Math.floor(safeDelta))},
        },
    });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskNumber: string }> }) {
    const auth = await requireStudyParticipant(req);
    if (!auth.ok) return NextResponse.json({ok: false, error: auth.error}, {status: auth.status});
    const p = auth.participant;

    const {taskNumber: raw} = await ctx.params;
    const taskNumber = Number(raw);
    if (![1, 2, 3].includes(taskNumber)) return NextResponse.json({
        ok: false,
        error: "Invalid taskNumber."
    }, {status: 400});

    if (p.currentStep !== chatStep(taskNumber)) {
        return NextResponse.json({
            ok: false,
            error: "Wrong step.",
            redirectTo: stepToPath(p.accessCode, p.currentStep as any, p.currentTaskNumber),
        }, {status: 409});
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
        // Find taskSession id (we need it to close threads).
        const taskSession = await tx.taskSession.findUnique({
            where: {participantId_taskNumber: {participantId: p.id, taskNumber}},
            select: {id: true},
        });

        if (!taskSession) {
            throw new Error("TaskSession not found for participant/taskNumber.");
        }

        // Finalize side panel usage (best-effort).
        // NOTE: We intentionally do not throw if this fails; the primary flow must succeed.
        try {
            await finalizeSidePanelSpansForTaskSession({tx, taskSessionId: taskSession.id, now});
        } catch (e) {
            console.error("[task/ready] finalize side panel failed (best-effort):", e);
        }

        // End chat timing.
        await tx.taskSession.update({
            where: {id: taskSession.id},
            data: {
                readyToAnswerAt: now,
                chatEndedAt: now,
            },
        });

        // Close any ACTIVE threads for this task session.
        await tx.chatThread.updateMany({
            where: {taskSessionId: taskSession.id, status: "ACTIVE"},
            data: {
                status: "CLOSED",
                closeReason: "TASK_FINISHED",
                closedAt: now,
            },
        });

        // Advance participant to post survey.
        await tx.participant.update({
            where: {id: p.id},
            data: {currentStep: postStep(taskNumber) as any},
        });
    });

    return NextResponse.json({ok: true, redirectTo: `/study/${p.accessCode}/task/${taskNumber}/post`});
}
