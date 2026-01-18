// app/api/study/_auth.ts
//
// Purpose:
// - Shared auth logic for /api/study/* endpoints.
//
// Why:
// - Every endpoint must enforce:
//   1) Authorization Bearer token exists
//   2) Token signature + exp valid
//   3) Token maps to a real participant
//
// This is the core reason "direct navigation" does not work:
// - Pages do not expose data without a valid in-memory token.
//
// Additional behavior (dropout-safe timing):
// - We update participant.lastActiveAt on every successful authenticated call.
// - We also perform a "lazy cleanup" for abandoned chats:
//   - If the participant was inactive for > INACTIVITY_CLOSE_MS,
//     we close any ACTIVE ChatThreads for this participant as ABANDONED,
//     and we cap TaskSession.chatEndedAt to the participant's previous lastActiveAt.
//   - This prevents "10 day duration" artifacts when someone closes the tab and returns later.
//
// Notes:
// - We do NOT attempt perfect disconnect detection (impossible with pure HTTP).
// - Heartbeat pings from the client keep lastActiveAt accurate while the tab is open.
//
// PATCH (TS2737 fix; drop-in, minimal)
// -----------------------------------
// - Your TS target is < ES2020 → BigInt *literals* like `0n` / `5n` trigger TS2737.
// - This file must not contain any BigInt literals. If you previously had something like
//   `5n * 60n * 1000n`, it MUST be plain number math instead.
// - No behavior changes.

import {NextRequest} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {verifyStudyToken} from "@/app/modules/publicStudy/session-token";

// IMPORTANT: keep this as a number expression (no BigInt literals like `5n`).
const INACTIVITY_CLOSE_MS = 5 * 60 * 1000; // 5 minutes

function getBearerToken(req: NextRequest) {
    const auth = req.headers.get("authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}

async function closeAbandonedChatsForParticipant(args: {
    participantId: string;
    endedAt: Date;
}) {
    // Find all ACTIVE threads for any TaskSession of this participant.
    const active = await prisma.chatThread.findMany({
        where: {
            status: "ACTIVE",
            taskSession: {participantId: args.participantId},
        },
        select: {id: true, taskSessionId: true},
    });

    if (active.length === 0) return;

    const threadIds = active.map((t) => t.id);
    const sessionIds = Array.from(new Set(active.map((t) => t.taskSessionId)));

    // Close threads as ABANDONED and cap closedAt to the last known activity time.
    await prisma.chatThread.updateMany({
        where: {id: {in: threadIds}, status: "ACTIVE"},
        data: {
            status: "CLOSED",
            closeReason: "ABANDONED",
            closedAt: args.endedAt,
        },
    });

    // Cap chatEndedAt for sessions that never got a clean end.
    await prisma.taskSession.updateMany({
        where: {id: {in: sessionIds}, chatEndedAt: null},
        data: {chatEndedAt: args.endedAt},
    });

    // Deterministic restart reconciliation:
    // Why:
    // - A participant can leave without a clean "RESTARTED" close and later start a new thread.
    // - Thread count is the source of truth: restarts = max(0, threads - 1).
    // - After we mark abandoned threads CLOSED, we recompute restart counters for affected sessions.
    for (const sessionId of sessionIds) {
        const threadCount = await prisma.chatThread.count({
            where: {taskSessionId: sessionId},
        });

        const derivedRestarts = Math.max(0, threadCount - 1);

        await prisma.taskSession.update({
            where: {id: sessionId},
            data: {chatRestartCount: derivedRestarts},
        });
    }
}

export async function requireStudyParticipant(req: NextRequest) {
    const token = getBearerToken(req);
    if (!token) {
        return {ok: false as const, status: 401, error: "Missing Authorization token."};
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        return {ok: false as const, status: 500, error: "AUTH_SECRET not configured."};
    }

    const verified = verifyStudyToken({token, secret});
    if (!verified.ok) {
        return {ok: false as const, status: 401, error: verified.error};
    }

    const participant = await prisma.participant.findUnique({
        where: {id: verified.payload.sub},
        select: {
            id: true,
            accessCode: true,
            status: true,
            currentStep: true,
            currentTaskNumber: true,
            studyId: true,
            assignedVariant: true,
            sidePanelEnabled: true,
            lastActiveAt: true, // <-- IMPORTANT for lazy cleanup + duration capping
        },
    });

    if (!participant) {
        return {ok: false as const, status: 401, error: "Participant not found."};
    }

    if (participant.accessCode !== verified.payload.accessCode) {
        return {ok: false as const, status: 401, error: "Token does not match participant access code."};
    }

    if (participant.status === "INVALIDATED" || participant.status === "WITHDRAWN") {
        return {ok: false as const, status: 403, error: "Participant not allowed."};
    }

    const now = new Date();
    const prevLastActiveAt = participant.lastActiveAt ?? null;

    // What: update lastActiveAt on every successful authenticated call.
    // Why: you want dropout/inactivity metrics.
    await prisma.participant.update({
        where: {id: participant.id},
        data: {lastActiveAt: now},
    });

    // Lazy cleanup:
    // If the participant had no activity for > 5 minutes and returns later,
    // we retroactively close ACTIVE threads and cap durations to the last known activity time.
    if (prevLastActiveAt) {
        const gapMs = now.getTime() - prevLastActiveAt.getTime();
        if (gapMs > INACTIVITY_CLOSE_MS) {
            try {
                await closeAbandonedChatsForParticipant({
                    participantId: participant.id,
                    endedAt: prevLastActiveAt,
                });
            } catch (e) {
                // Best-effort: auth should still succeed even if cleanup fails.
                console.error("[study/_auth] lazy cleanup failed:", e);
            }
        }
    }

    return {ok: true as const, participant};
}
