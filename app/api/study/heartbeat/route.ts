// app/api/study/heartbeat/route.ts
//
// Purpose:
// - Keep participant.lastActiveAt fresh while the user is on a page,
//   even if they are not sending chat messages or submitting forms.
//
// Why:
// - Without heartbeats, "time spent" would look like 10 days if the user closes the tab
//   and returns much later.
// - We intentionally keep this very small: requireStudyParticipant() already updates lastActiveAt.
//
// Behavior:
// - Auth required (same as other study endpoints).
// - Returns { ok: true } on success.

import {NextRequest, NextResponse} from "next/server";
import {requireStudyParticipant} from "@/app/api/study/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const auth = await requireStudyParticipant(req);
    if (!auth.ok) {
        return NextResponse.json({ok: false, error: auth.error}, {status: auth.status});
    }

    return NextResponse.json({ok: true});
}
