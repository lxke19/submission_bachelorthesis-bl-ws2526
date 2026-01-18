// app/api/study/resume/route.ts
//
// Purpose:
// - Resolve the participant's current step from DB (via session token).
// - Return redirectTo for the correct public page route.
//
// Why:
// - ResumeClient calls /api/study/resume (no accessCode in path).
// - The accessCode is already inside the signed participant session token,
//   so the API route does NOT need /api/study/[accessCode]/resume.

import {NextRequest, NextResponse} from "next/server";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {stepToPath} from "@/app/modules/publicStudy/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const auth = await requireStudyParticipant(req);
    if (!auth.ok) return NextResponse.json({ok: false, error: auth.error}, {status: auth.status});

    const p = auth.participant;

    return NextResponse.json({
        ok: true,
        redirectTo: stepToPath(p.accessCode, p.currentStep as any, p.currentTaskNumber),
    });
}
