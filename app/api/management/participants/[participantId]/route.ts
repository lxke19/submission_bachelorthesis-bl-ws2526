// app/api/management/participants/[participantId]/route.ts
//
// Purpose:
// - Provide a single participant record for the details view.
// - Include minimal related info (study + access logs) so admin can inspect progress.
//
// Why:
// - The details page needs a stable "read model" that can later be extended (surveys, tasks, chat).

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireApiAuthUserId} from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ participantId: string }> }) {
    // What: Enforce management auth.
    // Why: Details contain participant progress and metadata.
    try {
        await requireApiAuthUserId();
    } catch {
        return NextResponse.json({ok: false, error: "Unauthorized"}, {status: 401});
    }

    const {participantId} = await ctx.params;

    const participant = await prisma.participant.findUnique({
        where: {id: participantId},
        select: {
            id: true,
            accessCode: true,
            participantLabel: true,
            status: true,
            currentStep: true,
            currentTaskNumber: true,
            assignedVariant: true,
            sidePanelEnabled: true,
            startedAt: true,
            completedAt: true,
            lastActiveAt: true,
            reentryCount: true,
            createdAt: true,
            updatedAt: true,
            study: {
                select: {id: true, key: true, name: true},
            },
            accessLogs: {
                select: {id: true, enteredAt: true, userAgent: true, clientMeta: true},
                orderBy: [{enteredAt: "desc"}],
                take: 25,
            },
        },
    });

    if (!participant) {
        return NextResponse.json({ok: false, error: "Participant not found."}, {status: 404});
    }

    return NextResponse.json({ok: true, participant});
}
