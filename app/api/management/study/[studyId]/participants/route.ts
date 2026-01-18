// app/api/management/study/[studyId]/participants/route.ts
//
// Purpose:
// - Admin-only: list participants for one study.
// - Used by Management Overview -> Participants tab.
//
// Notes:
// - Returns lightweight rows only (details/transcript loaded on demand).

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireAuthenticatedUser} from "@/app/lib/auth";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ studyId: string }> }) {
    const user = await requireAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ok: false, error: "Unauthorized"}, {status: 401});
    }

    const {studyId} = await ctx.params;

    const participants = await prisma.participant.findMany({
        where: {studyId},
        orderBy: [{createdAt: "asc"}],
        select: {
            id: true,
            accessCode: true,
            participantLabel: true,
            status: true,
            currentStep: true,
            currentTaskNumber: true,
            startedAt: true,
            completedAt: true,
            lastActiveAt: true,
            assignedVariant: true,
            sidePanelEnabled: true,
        },
    });

    return NextResponse.json({
        ok: true,
        participants: participants.map((p) => ({
            ...p,
            startedAt: p.startedAt ? p.startedAt.toISOString() : null,
            completedAt: p.completedAt ? p.completedAt.toISOString() : null,
            lastActiveAt: p.lastActiveAt ? p.lastActiveAt.toISOString() : null,
        })),
    });
}
