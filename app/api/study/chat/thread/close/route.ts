// app/api/study/chat/thread/close/route.ts
//
// Purpose:
// - Close a ChatThread deterministically in the App DB.
// - Called when user starts a new chat (restart) or when the task chat is finished.
//
// Notes:
// - Ownership is enforced via requireStudyParticipant + join through TaskSession.
//
// Restart counting rule:
// - A "restart" means: the user starts a NEW thread after the first thread existed for the task.
// - We count it when we CLOSE a thread with reason = "RESTARTED" (idempotent: only when status was ACTIVE).
// - Thread #0 is not a restart; each subsequent new thread implies exactly one RESTARTED close of the previous ACTIVE thread.

import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {prisma} from "@/app/lib/prisma";
import {requireStudyParticipant} from "@/app/api/study/_auth";

const BodySchema = z.object({
    langGraphThreadId: z.string().min(1),
    reason: z.enum(["RESTARTED", "TASK_FINISHED", "ABANDONED", "ERROR"]),
});

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

    const thread = await prisma.chatThread.findUnique({
        where: {langGraphThreadId: body.langGraphThreadId},
        select: {
            id: true,
            status: true,
            taskSessionId: true,
            taskSession: {select: {participantId: true}},
        },
    });

    if (!thread) {
        // Idempotent close: if thread does not exist, treat as ok.
        return NextResponse.json({ok: true, closed: false});
    }

    if (thread.taskSession.participantId !== participant.id) {
        return NextResponse.json({ok: false, error: "Thread does not belong to participant."}, {status: 403});
    }

    // If already closed, keep idempotent.
    if (thread.status === "CLOSED") {
        return NextResponse.json({ok: true, closed: false});
    }

    await prisma.$transaction(async (tx) => {
        await tx.chatThread.update({
            where: {id: thread.id},
            data: {
                status: "CLOSED",
                closeReason: body.reason,
                closedAt: new Date(),
            },
        });

        // Restart counter:
        // - Only increment when we are closing an ACTIVE thread due to a user-initiated restart.
        // - This matches the rule: first thread => 0 restarts; each additional new thread => +1 restart.
        if (body.reason === "RESTARTED") {
            await tx.taskSession.update({
                where: {id: thread.taskSessionId},
                data: {
                    chatRestartCount: {increment: 1},
                },
            });
        }

        // If task finished, also mark chatEndedAt (first time only).
        if (body.reason === "TASK_FINISHED") {
            await tx.taskSession.update({
                where: {id: thread.taskSessionId},
                data: {
                    chatEndedAt: new Date(),
                },
            });
        }
    });

    return NextResponse.json({ok: true, closed: true});
}
