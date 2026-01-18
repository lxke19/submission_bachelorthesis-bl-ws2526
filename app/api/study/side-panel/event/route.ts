// app/api/study/side-panel/event/route.ts
//
// Side Panel Usage Event (Study)
// ==============================
//
// Contract:
// - Client sends POST with `{ open: boolean, langGraphThreadId?: string|null }`
// - We record open/close counts + open duration (ms) on TaskSession,
//   and also append a precise open→close span (SidePanelSpan).
//
// Safety / Robustness:
// - Only count during TASKn_CHAT (best-effort; ignore outside).
// - Idempotent open: if a span is already open, do not double-count.
// - Close is best-effort: if no open span exists, no-op.
// - Thread linking is best-effort (langGraphThreadId may be missing).
//
// IMPORTANT (Drop-in):
// - This endpoint does not control whether the panel is allowed;
//   the UI gating lives in `components/thread/index.tsx`.

import {NextRequest, NextResponse} from "next/server";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {prisma} from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Robustness/Idempotency Notes (server-side)
 * =========================================
 *
 * Goals:
 * - Never crash the study UI due to "late" or "out-of-order" events.
 * - Ensure analysis can always use the stored metrics (even if events arrive after routing changes).
 *
 * Key behavior changes (minimal but important):
 * - OPEN events are only recorded during TASKn_CHAT (best-effort).
 * - CLOSE events are allowed even outside TASKn_CHAT and even if currentTaskNumber changed,
 *   because otherwise we'd leave spans open forever and inflate durations.
 * - CLOSE will close the latest open span for this participant across ALL task sessions.
 * - All database actions are best-effort; unexpected issues return {ok:true, ignored:true} instead of 500.
 */

export async function POST(req: NextRequest) {
    const auth = await requireStudyParticipant(req);
    if (!auth.ok) {
        return NextResponse.json({ok: false, error: auth.error}, {status: auth.status});
    }

    const p = auth.participant;

    const body = (await req.json().catch(() => null)) as
        | { open?: boolean; langGraphThreadId?: string | null }
        | null;

    if (!body || typeof body.open !== "boolean") {
        return NextResponse.json({ok: false, error: "Invalid body."}, {status: 400});
    }

    const open = body.open;
    const langGraphThreadId = body?.langGraphThreadId ? String(body.langGraphThreadId) : null;

    const now = new Date();

    // OPEN events: need a concrete task context. If missing, we ignore (do not hard-fail).
    // CLOSE events: can be processed without currentTaskNumber (close latest open span across tasks).
    if (open) {
        if (!p.currentTaskNumber) {
            return NextResponse.json({ok: true, ignored: true, reason: "No currentTaskNumber for open event."});
        }

        const taskNumber = p.currentTaskNumber;

        // Optional: nur während TASKn_CHAT zählen (empfehlenswert)
        const expectedStep = `TASK${taskNumber}_CHAT`;
        if (String(p.currentStep) !== expectedStep) {
            return NextResponse.json({ok: true, ignored: true}); // best-effort, nicht hart failen
        }

        try {
            await prisma.$transaction(async (tx) => {
                const taskSession = await tx.taskSession.findUnique({
                    where: {participantId_taskNumber: {participantId: p.id, taskNumber}},
                    select: {id: true},
                });

                // Best-effort: if session missing (shouldn't happen), ignore.
                if (!taskSession) return;

                // versuche ChatThread zu finden:
                // 1) per langGraphThreadId wenn mitgegeben (BUT enforce ownership)
                // 2) sonst ACTIVE Thread der TaskSession (oder latest)
                const chatThread = langGraphThreadId
                    ? await tx.chatThread.findFirst({
                        where: {
                            langGraphThreadId,
                            taskSessionId: taskSession.id, // ownership guard: thread must belong to this task session
                        },
                        select: {id: true},
                    })
                    : await tx.chatThread.findFirst({
                        where: {taskSessionId: taskSession.id, status: "ACTIVE"},
                        orderBy: {createdAt: "desc"},
                        select: {id: true},
                    });

                // last message seq (optional)
                const lastMsgSeq = chatThread?.id
                    ? (
                    await tx.chatMessage.findFirst({
                        where: {chatThreadId: chatThread.id},
                        orderBy: {sequence: "desc"},
                        select: {sequence: true},
                    })
                )?.sequence ?? null
                    : null;

                const openSpan = await tx.sidePanelSpan.findFirst({
                    where: {taskSessionId: taskSession.id, closedAt: null},
                    orderBy: {openedAt: "desc"},
                    select: {id: true, openedAt: true, chatThreadId: true},
                });

                // idempotent: wenn schon offen, nicht doppelt zählen
                if (openSpan) {
                    // Best-effort enrichment: if span exists but has no thread link yet, attach it (no counting).
                    if (!openSpan.chatThreadId && chatThread?.id) {
                        await tx.sidePanelSpan.update({
                            where: {id: openSpan.id},
                            data: {
                                chatThreadId: chatThread.id,
                                openedAfterMessageSeq: lastMsgSeq,
                            },
                        });
                    }
                    return;
                }

                await tx.taskSession.update({
                    where: {id: taskSession.id},
                    data: {sidePanelOpenCount: {increment: 1}},
                });

                await tx.sidePanelSpan.create({
                    data: {
                        taskSessionId: taskSession.id,
                        openedAt: now,
                        chatThreadId: chatThread?.id ?? null,
                        openedAfterMessageSeq: lastMsgSeq,
                    },
                });
            });

            return NextResponse.json({ok: true});
        } catch (e) {
            // Best-effort: never break the participant UI due to logging issues.
            console.error("[side-panel/event] open transaction failed:", e);
            return NextResponse.json({ok: true, ignored: true, reason: "Open event failed (best-effort)."});
        }
    }

    // CLOSE event
    // ===========
    // Robust rule:
    // - Close the latest open span for THIS participant across ALL task sessions,
    //   even if participant already navigated away from TASKn_CHAT or changed tasks.
    // - This prevents "open forever" spans and makes durations analyzable.
    try {
        await prisma.$transaction(async (tx) => {
            const openSpan = await tx.sidePanelSpan.findFirst({
                where: {
                    closedAt: null,
                    taskSession: {participantId: p.id},
                },
                orderBy: {openedAt: "desc"},
                select: {id: true, openedAt: true, taskSessionId: true, chatThreadId: true},
            });

            // close is best-effort: if nothing open, no-op
            if (!openSpan) return;

            // Determine which thread to use for last message seq:
            // - Prefer the thread linked on the span
            // - Else: try langGraphThreadId if given AND belongs to the same taskSession
            // - Else: latest ACTIVE for that taskSession
            const chatThread =
                openSpan.chatThreadId
                    ? {id: openSpan.chatThreadId}
                    : (langGraphThreadId
                        ? await tx.chatThread.findFirst({
                            where: {
                                langGraphThreadId,
                                taskSessionId: openSpan.taskSessionId, // ownership/consistency guard
                            },
                            select: {id: true},
                        })
                        : await tx.chatThread.findFirst({
                            where: {taskSessionId: openSpan.taskSessionId, status: "ACTIVE"},
                            orderBy: {createdAt: "desc"},
                            select: {id: true},
                        }));

            const lastMsgSeq = chatThread?.id
                ? (
                await tx.chatMessage.findFirst({
                    where: {chatThreadId: chatThread.id},
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
                    // Best-effort: if span had no chatThreadId, attach it now.
                    ...(openSpan.chatThreadId ? {} : {chatThreadId: chatThread?.id ?? null}),
                },
            });

            await tx.taskSession.update({
                where: {id: openSpan.taskSessionId},
                data: {
                    sidePanelCloseCount: {increment: 1},
                    sidePanelOpenMs: {increment: BigInt(Math.floor(safeDelta))},
                },
            });
        });

        return NextResponse.json({ok: true});
    } catch (e) {
        // Best-effort: never break the participant UI due to logging issues.
        console.error("[side-panel/event] close transaction failed:", e);
        return NextResponse.json({ok: true, ignored: true, reason: "Close event failed (best-effort)."});
    }
}
