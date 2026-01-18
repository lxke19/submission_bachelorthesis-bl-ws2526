// app/api/study/session/start/route.ts
//
// Purpose:
// - "Login" for participant via accessCode.
// - Creates ParticipantAccessLog.
// - Updates participant startedAt/status/step when appropriate.
// - Returns signed token (in-memory only on client) + redirectTo.
//
// Why:
// - You want strict control: only after entering access code the user can access study APIs.
// - Token is NOT persisted; reload removes it => user must re-enter access code.
//
// Variant / Study policy (IMPORTANT):
// - The decisive flag for the Data Insights side panel is Participant.sidePanelEnabled.
// - We include it as a signed claim in the token so the client can gate the UI deterministically.

import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {prisma} from "@/app/lib/prisma";
import {signStudyToken} from "@/app/modules/publicStudy/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
    accessCode: z.string().trim().min(1).max(200),
    clientMeta: z.unknown().optional(),
});

export async function POST(req: NextRequest) {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        return NextResponse.json({ok: false, error: "AUTH_SECRET not configured."}, {status: 500});
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ok: false, error: "Invalid JSON body."}, {status: 400});
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({
            ok: false,
            error: "Validation failed.",
            details: parsed.error.flatten()
        }, {status: 400});
    }

    const accessCode = parsed.data.accessCode;

    const participant = await prisma.participant.findUnique({
        where: {accessCode},
        select: {
            id: true,
            accessCode: true,
            status: true,
            currentStep: true,
            currentTaskNumber: true,
            startedAt: true,
            sidePanelEnabled: true,
        },
    });

    if (!participant) {
        return NextResponse.json({ok: false, error: "Access-Code nicht gefunden."}, {status: 404});
    }

    if (participant.status === "INVALIDATED" || participant.status === "WITHDRAWN") {
        return NextResponse.json({ok: false, error: "Teilnahme nicht erlaubt."}, {status: 403});
    }

    const now = new Date();
    const userAgent = req.headers.get("user-agent") ?? null;

    // Transaction: log + participant state updates should be consistent.
    const updated = await prisma.$transaction(async (tx) => {
        await tx.participantAccessLog.create({
            data: {
                participantId: participant.id,
                enteredAt: now,
                userAgent,
                clientMeta: parsed.data.clientMeta ?? undefined,
            },
        });

        // What: reentryCount increments on each access code entry.
        // Why: you want measurable interruption/re-entry behavior.
        const nextReentryCount = {increment: 1} as const;

        // What: set startedAt when first time.
        // Why: total duration start point.
        const startedAt = participant.startedAt ?? now;

        // What: status flips CREATED -> STARTED on first entry.
        // Why: you want clear state semantics.
        const nextStatus = participant.status === "CREATED" ? "STARTED" : participant.status;

        // What: if participant was still at WELCOME, start with PRE_SURVEY.
        // Why: entering access code is the start trigger.
        const nextStep = participant.currentStep === "WELCOME" ? "PRE_SURVEY" : participant.currentStep;

        return tx.participant.update({
            where: {id: participant.id},
            data: {
                reentryCount: nextReentryCount,
                startedAt,
                status: nextStatus as any,
                currentStep: nextStep as any,
                lastActiveAt: now,
            },
            select: {id: true, accessCode: true, currentStep: true, currentTaskNumber: true},
        });
    });

    const token = signStudyToken({
        participantId: updated.id,
        accessCode: updated.accessCode,
        secret,
        ttlSeconds: 60 * 60 * 2,
        sidePanelEnabled: participant.sidePanelEnabled,
    });

    // What: we route via /resume always (client does /api/study/resume).
    // Why: single deterministic routing point.
    const redirectTo = `/study/${updated.accessCode}/resume`;

    return NextResponse.json({ok: true, token, accessCode: updated.accessCode, redirectTo});
}
