// app/api/study/chat/thread/upsert/route.ts
//
// Purpose:
// - Ensure a ChatThread row exists in the App DB for the given LangGraph thread_id.
// - Must be idempotent and race-safe:
//   - React StrictMode in dev can call effects twice.
//   - message/upsert may also create the thread (race-safe path).
//
// Behavior:
// - If the thread already exists: return it (and optionally ensure it's ACTIVE).
// - If it doesn't exist: create it with restartIndex = count(existing threads for taskSession).
// - If create hits a unique constraint (P2002): fetch existing and return it.
//
// Security:
// - The thread must belong to the authenticated participant's task session.
//
// Inputs:
// - langGraphThreadId: string (required)
// - taskNumber: number (optional; fallback to participant.currentTaskNumber)

import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {prisma} from "@/app/lib/prisma";
import {requireStudyParticipant} from "@/app/api/study/_auth";

const BodySchema = z.object({
    langGraphThreadId: z.string().min(1),
    taskNumber: z.number().int().min(1).max(3).optional(),
});

// What: small sleep helper.
// Why: when a concurrent transaction just created the row, it may not be visible yet
//      at the exact moment we catch P2002.
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// What: fetch a ChatThread by langGraphThreadId with short retries.
// Why: avoid returning 500 on P2002 when the winner transaction hasn't committed yet.
async function findThreadWithRetry(args: {
    langGraphThreadId: string;
    attempts?: number;
    delayMs?: number;
}) {
    const attempts = args.attempts ?? 10;
    const delayMs = args.delayMs ?? 25;

    for (let i = 0; i < attempts; i++) {
        const existing = await prisma.chatThread.findUnique({
            where: {langGraphThreadId: args.langGraphThreadId},
            select: {id: true, restartIndex: true},
        });

        if (existing) return existing;

        // No row yet; wait briefly and retry.
        await sleep(delayMs);
    }

    return null;
}

export async function POST(req: NextRequest) {
    const auth = await requireStudyParticipant(req);
    if (!auth.ok) {
        return NextResponse.json({ok: false, error: auth.error}, {status: auth.status});
    }

    let body: z.infer<typeof BodySchema>;
    try {
        body = BodySchema.parse(await req.json());
    } catch (e) {
        return NextResponse.json(
            {ok: false, error: "Invalid request body.", details: e instanceof Error ? e.message : String(e)},
            {status: 400},
        );
    }

    const participant = auth.participant;
    const resolvedTaskNumber = body.taskNumber ?? participant.currentTaskNumber ?? null;
    if (!resolvedTaskNumber) {
        return NextResponse.json(
            {ok: false, error: "Missing taskNumber and participant.currentTaskNumber is null."},
            {status: 400},
        );
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1) Find the participant's TaskSession for this task.
            const taskSession = await tx.taskSession.findUnique({
                where: {participantId_taskNumber: {participantId: participant.id, taskNumber: resolvedTaskNumber}},
                select: {id: true, participantId: true, chatStartedAt: true, chatRestartCount: true},
            });

            if (!taskSession) {
                throw new Error("TaskSession not found for participant/taskNumber.");
            }

            // 2) If thread already exists, ensure ownership and return it.
            const existing = await tx.chatThread.findUnique({
                where: {langGraphThreadId: body.langGraphThreadId},
                select: {
                    id: true,
                    taskSessionId: true,
                    status: true,
                    restartIndex: true,
                    createdAt: true,
                    closedAt: true,
                    closeReason: true,
                    taskSession: {select: {participantId: true}},
                },
            });

            if (existing) {
                if (existing.taskSession.participantId !== participant.id) {
                    // Safety check: don't let one participant "claim" another participant's thread.
                    const err = new Error("Thread does not belong to participant.");
                    (err as any).httpStatus = 403;
                    throw err;
                }

                // Optional: ensure status ACTIVE (without changing restartIndex).
                if (existing.status !== "ACTIVE") {
                    await tx.chatThread.update({
                        where: {id: existing.id},
                        data: {status: "ACTIVE"},
                    });
                }

                // Ensure chatStartedAt if missing (first time UI confirms thread exists)
                if (!taskSession.chatStartedAt) {
                    await tx.taskSession.update({
                        where: {id: taskSession.id},
                        data: {chatStartedAt: new Date()},
                    });
                }

                // Deterministic restart reconciliation:
                // - Source of truth is thread count: restarts = max(0, threads - 1).
                // - This fixes "absurd" flows where the user leaves without a clean restart close.
                const threadCountNow = await tx.chatThread.count({
                    where: {taskSessionId: taskSession.id},
                });
                const derivedRestarts = Math.max(0, threadCountNow - 1);

                if (derivedRestarts !== (taskSession.chatRestartCount ?? 0)) {
                    await tx.taskSession.update({
                        where: {id: taskSession.id},
                        data: {chatRestartCount: derivedRestarts},
                    });
                }

                return {created: false, thread: existing};
            }

            // 3) Close any other ACTIVE threads for this task session (best-effort safety).
            // In your flow you ALSO close on "New Chat" via /thread/close,
            // but this keeps the DB consistent even if a client skips that call.
            const closed = await tx.chatThread.updateMany({
                where: {
                    taskSessionId: taskSession.id,
                    status: "ACTIVE",
                    langGraphThreadId: {not: body.langGraphThreadId},
                },
                data: {
                    status: "CLOSED",
                    closeReason: "RESTARTED",
                    closedAt: new Date(),
                },
            });

            if (closed.count > 0) {
                await tx.taskSession.update({
                    where: {id: taskSession.id},
                    data: {chatRestartCount: {increment: closed.count}},
                });
            }

            // 4) Compute restartIndex for the new thread.
            const threadCount = await tx.chatThread.count({
                where: {taskSessionId: taskSession.id},
            });

            // 5) Create thread (race-safe: catch unique constraint outside tx if needed).
            const created = await tx.chatThread.create({
                data: {
                    taskSessionId: taskSession.id,
                    langGraphThreadId: body.langGraphThreadId,
                    status: "ACTIVE",
                    restartIndex: threadCount,
                },
                select: {
                    id: true,
                    taskSessionId: true,
                    status: true,
                    restartIndex: true,
                    createdAt: true,
                    closedAt: true,
                    closeReason: true,
                    taskSession: {select: {participantId: true}},
                },
            });

            // Ensure chatStartedAt if missing.
            if (!taskSession.chatStartedAt) {
                await tx.taskSession.update({
                    where: {id: taskSession.id},
                    data: {chatStartedAt: new Date()},
                });
            }

            // Deterministic restart reconciliation (post-create):
            // - After the new thread exists, set chatRestartCount = max(0, threads - 1).
            // - This is the robust rule even if prior sessions ended ABANDONED or without clean closes.
            const threadCountAfterCreate = await tx.chatThread.count({
                where: {taskSessionId: taskSession.id},
            });
            const derivedRestartsAfterCreate = Math.max(0, threadCountAfterCreate - 1);

            await tx.taskSession.update({
                where: {id: taskSession.id},
                data: {chatRestartCount: derivedRestartsAfterCreate},
            });

            return {created: true, thread: created};
        });

        return NextResponse.json({
            ok: true,
            created: result.created,
            chatThreadDbId: result.thread.id,
            langGraphThreadId: body.langGraphThreadId,
            restartIndex: result.thread.restartIndex,
        });
    } catch (e: any) {
        // Ownership error
        if (e?.httpStatus === 403) {
            return NextResponse.json({ok: false, error: "Thread does not belong to participant."}, {status: 403});
        }

        // Prisma unique constraint (P2002) - race between two upserts.
        // Fetch existing and return success.
        //
        // NOTE:
        // Sometimes the winner transaction is not yet committed when we catch P2002.
        // We therefore retry a few times before giving up.
        if (e?.code === "P2002") {
            const existing = await findThreadWithRetry({langGraphThreadId: body.langGraphThreadId});
            if (existing) {
                return NextResponse.json({
                    ok: true,
                    created: false,
                    chatThreadDbId: existing.id,
                    langGraphThreadId: body.langGraphThreadId,
                    restartIndex: existing.restartIndex,
                });
            }
        }

        const msg = e instanceof Error ? e.message : String(e);
        console.error("[thread/upsert] failed:", e);
        return NextResponse.json({ok: false, error: msg || "Internal error."}, {status: 500});
    }
}
