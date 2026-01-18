// app/api/study/chat/message/upsert/route.ts
//
// Purpose:
// - Persist a single LangGraph message into ChatMessage (append-only).
// - De-duplication is done using metadata.langGraphMessageId.
// - Sequence is assigned server-side as (max(sequence) + 1) to guarantee append-only ordering.
//
// Notes:
// - We store a "visible" content string in ChatMessage.content.
// - Raw message content is stored in metadata.rawContent.
// - We also store tool name + tool_call_id in metadata when provided.
// - Minimal metrics are updated on TaskSession:
//   - hasChattedAtLeastOnce
//   - userMessageCount / assistantMessageCount
//
// Why not store LangGraph id in a column?
// - Your schema intentionally keeps ChatMessage minimal.
// - We still keep it via metadata so we can do idempotent inserts.

import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {prisma} from "@/app/lib/prisma";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {
    contentToVisibleString,
    mapLangGraphTypeToRole,
    unknownToJsonValue,
    ZLangGraphMessageType
} from "@/app/api/study/chat/_utils";
import type {Prisma} from "@/app/generated/prisma/client";

const BodySchema = z.object({
    langGraphThreadId: z.string().min(1),

    // IMPORTANT:
    // - optional, but strongly recommended to avoid races when the first message arrives
    //   before /thread/upsert has been called.
    taskNumber: z.number().int().min(1).max(3).optional(),

    message: z.object({
        id: z.string().optional(), // LangGraph message id (preferred for dedupe)
        type: ZLangGraphMessageType,
        content: z.unknown(),
        // ToolMessage fields (optional)
        name: z.string().optional(),
        tool_call_id: z.string().optional(),
    }),
});

// What: small sleep helper.
// Why: when a concurrent transaction just created the row, it may not be visible yet
//      at the exact moment we catch P2002.
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// What: fetch ChatThread by langGraphThreadId with short retries.
// Why: message/upsert can race with thread/upsert; if we lose the create, the row may not be visible immediately.
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
            select: {
                id: true,
                taskSessionId: true,
                taskSession: {select: {participantId: true, chatStartedAt: true}},
            },
        });

        if (existing) return existing;

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

    // If client did not send taskNumber, try to derive it from participant state.
    const resolvedTaskNumber = body.taskNumber ?? participant.currentTaskNumber ?? null;
    if (!resolvedTaskNumber) {
        return NextResponse.json(
            {ok: false, error: "Missing taskNumber and participant.currentTaskNumber is null."},
            {status: 400},
        );
    }

    // Ensure thread exists (race-safe):
    // - If thread row is missing in App DB, we create it here based on participant + taskNumber.
    // - This prevents 404 when the first message arrives before /thread/upsert finishes.
    let ensuredThread: {
        id: string;
        taskSessionId: string;
        taskSession: { participantId: string; chatStartedAt: Date | null };
    };

    try {
        ensuredThread = await prisma.$transaction(async (tx) => {
            const existing = await tx.chatThread.findUnique({
                where: {langGraphThreadId: body.langGraphThreadId},
                select: {
                    id: true,
                    taskSessionId: true,
                    taskSession: {select: {participantId: true, chatStartedAt: true}},
                },
            });

            if (existing) {
                // Ownership check
                if (existing.taskSession.participantId !== participant.id) {
                    throw new Error("Thread does not belong to participant.");
                }
                return existing;
            }

            // Find the participant's TaskSession for this task.
            const taskSession = await tx.taskSession.findUnique({
                where: {participantId_taskNumber: {participantId: participant.id, taskNumber: resolvedTaskNumber}},
                select: {id: true, participantId: true},
            });

            if (!taskSession) {
                throw new Error("TaskSession not found for participant/taskNumber.");
            }

            // Compute restart index (0 = first thread, 1 = first restart, ...)
            const threadCount = await tx.chatThread.count({
                where: {taskSessionId: taskSession.id},
            });

            return tx.chatThread.create({
                data: {
                    taskSessionId: taskSession.id,
                    langGraphThreadId: body.langGraphThreadId,
                    status: "ACTIVE",
                    restartIndex: threadCount,
                },
                select: {
                    id: true,
                    taskSessionId: true,
                    taskSession: {select: {participantId: true, chatStartedAt: true}},
                },
            });
        });
    } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e);

        if (msg.includes("Thread does not belong to participant")) {
            return NextResponse.json({ok: false, error: "Thread does not belong to participant."}, {status: 403});
        }

        // Prisma unique constraint (P2002) - race with /thread/upsert or another message/upsert.
        // Wait briefly until the winner commit is visible.
        if (e?.code === "P2002") {
            const existing = await findThreadWithRetry({langGraphThreadId: body.langGraphThreadId});
            if (existing) {
                // Ownership check (still required)
                if (existing.taskSession.participantId !== participant.id) {
                    return NextResponse.json({
                        ok: false,
                        error: "Thread does not belong to participant."
                    }, {status: 403});
                }
                ensuredThread = existing;
            } else {
                console.error("[message/upsert] ensuredThread P2002 but thread not found after retry:", e);
                return NextResponse.json({ok: false, error: "Failed to ensure ChatThread (race)."}, {status: 500});
            }
        } else {
            console.error("[message/upsert] ensure thread failed:", e);
            return NextResponse.json({ok: false, error: msg || "Internal error."}, {status: 500});
        }
    }

    const thread = ensuredThread;

    const lgMessageId = body.message.id?.trim() || null;

    // -----------------------------
    // GLOBAL idempotency guard
    // -----------------------------
    // What: Prevent the same LangGraph message from being persisted into multiple App DB threads.
    // Why: If the client replays/rehydrates old UI messages into a new LangGraph thread (or mixes ids),
    //      per-thread dedupe would not catch it and you'd see "history carried over" across threads.
    if (lgMessageId) {
        const existingGlobal = await prisma.chatMessage.findFirst({
            where: {
                metadata: {
                    path: ["langGraphMessageId"],
                    equals: lgMessageId,
                },
            },
            select: {id: true, sequence: true, chatThreadId: true},
        });

        if (existingGlobal) {
            // If it already exists in this same thread: normal idempotent behavior.
            // If it exists in another thread: refuse to duplicate it (prevents cross-thread carryover).
            return NextResponse.json({
                ok: true,
                created: false,
                chatMessageId: existingGlobal.id,
                sequence: existingGlobal.sequence,
                alreadyPersisted: true,
                alreadyPersistedChatThreadId: existingGlobal.chatThreadId,
            });
        }
    }

    const role = mapLangGraphTypeToRole(body.message.type);
    const content = contentToVisibleString(body.message.content);

    // What: create message with a small retry loop.
    // Why: two concurrent upserts can compute the same nextSeq and hit the (chatThreadId,sequence) unique constraint.
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const created = await prisma.$transaction(async (tx) => {
                // Assign append-only sequence.
                const agg = await tx.chatMessage.aggregate({
                    where: {chatThreadId: thread.id},
                    _max: {sequence: true},
                });
                const nextSeq = (agg._max.sequence ?? 0) + 1;

                const metadata: Prisma.InputJsonValue = {
                    langGraphMessageId: lgMessageId,
                    rawContent: unknownToJsonValue(body.message.content),
                    toolName: body.message.name ?? null,
                    toolCallId: body.message.tool_call_id ?? null,
                };

                const msg = await tx.chatMessage.create({
                    data: {
                        chatThreadId: thread.id,
                        role,
                        content,
                        sequence: nextSeq,
                        metadata,
                    },
                    select: {id: true, sequence: true},
                });

                // Update minimal task session metrics (only on create).
                if (role === "USER") {
                    await tx.taskSession.update({
                        where: {id: thread.taskSessionId},
                        data: {
                            hasChattedAtLeastOnce: true,
                            userMessageCount: {increment: 1},
                            // If chatStartedAt is missing, set it now (first observed user activity).
                            ...(thread.taskSession.chatStartedAt ? {} : {chatStartedAt: new Date()}),
                        },
                    });
                } else if (role === "ASSISTANT") {
                    await tx.taskSession.update({
                        where: {id: thread.taskSessionId},
                        data: {
                            assistantMessageCount: {increment: 1},
                        },
                    });
                }

                return msg;
            });

            return NextResponse.json({ok: true, created: true, chatMessageId: created.id, sequence: created.sequence});
        } catch (e: any) {
            // If we have a LangGraph message id, a concurrent request may have inserted it between our global pre-check and create.
            if (lgMessageId) {
                const existingGlobal = await prisma.chatMessage.findFirst({
                    where: {
                        metadata: {
                            path: ["langGraphMessageId"],
                            equals: lgMessageId,
                        },
                    },
                    select: {id: true, sequence: true, chatThreadId: true},
                });

                if (existingGlobal) {
                    return NextResponse.json({
                        ok: true,
                        created: false,
                        chatMessageId: existingGlobal.id,
                        sequence: existingGlobal.sequence,
                        alreadyPersisted: true,
                        alreadyPersistedChatThreadId: existingGlobal.chatThreadId,
                    });
                }
            }

            // Sequence race (chatThreadId, sequence)
            if (e?.code === "P2002") {
                // Retry a few times; next attempt will recompute max(sequence).
                if (attempt < maxAttempts) continue;
            }

            const msg = e instanceof Error ? e.message : String(e);
            console.error("[message/upsert] failed:", e);
            return NextResponse.json({ok: false, error: msg || "Internal error."}, {status: 500});
        }
    }

    // Should not be reachable, but keep a safe fallback.
    return NextResponse.json({ok: false, error: "Failed to persist message after retries."}, {status: 500});
}
