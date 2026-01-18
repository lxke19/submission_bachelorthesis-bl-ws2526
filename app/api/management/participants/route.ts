// app/api/management/participants/route.ts
//
// Purpose:
// - GET: List participants with filters (study/status) and search (accessCode/label).
// - POST: Create one participant (single create only, no bulk).
//
// Why in one route:
// - Classic REST: collection endpoints handle list + create.
// - Keeps management API simple and predictable.

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireApiAuthUserId} from "@/app/lib/auth";
import {z} from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateParticipantSchema = z.object({
    // What: Study to attach the participant to.
    // Why: Your Participant MUST belong to exactly one Study (schema requirement).
    studyId: z.string().uuid(),

    // What: Experimental condition.
    // Why: Needed for later analysis (variant comparison).
    assignedVariant: z.enum(["VARIANT_1", "VARIANT_2"]),

    // What: Optional human-friendly label like "P001".
    // Why: Easier admin workflow and exports; still keep accessCode as the real participant login key.
    participantLabel: z.string().trim().min(1).max(64).optional(),
});

function clampTake(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
}

export async function GET(req: NextRequest) {
    // What: Enforce management auth.
    // Why: Participant listing contains study + progress metadata (admin-only).
    try {
        await requireApiAuthUserId();
    } catch {
        return NextResponse.json({ok: false, error: "Unauthorized"}, {status: 401});
    }

    const {searchParams} = new URL(req.url);

    const q = searchParams.get("q")?.trim() ?? "";
    const studyId = searchParams.get("studyId")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const take = clampTake(Number(searchParams.get("take") ?? "50"), 1, 200);

    const where: any = {};

    // What: Filter by study.
    // Why: Admin requested study filtering in the list view.
    if (studyId) {
        where.studyId = studyId;
    }

    // What: Filter by status (CREATED/STARTED/COMPLETED/...).
    // Why: Admin needs quick operations dashboard.
    if (status) {
        where.status = status;
    }

    // What: Search by accessCode and participantLabel (contains).
    // Why: Primary workflow is searching the access code; label is a nice secondary.
    if (q) {
        where.OR = [
            {accessCode: {contains: q, mode: "insensitive"}},
            {participantLabel: {contains: q, mode: "insensitive"}},
        ];
    }

    const participants = await prisma.participant.findMany({
        where,
        take,
        orderBy: [{createdAt: "desc"}],
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
        },
    });

    return NextResponse.json({ok: true, participants});
}

export async function POST(req: NextRequest) {
    // What: Enforce management auth.
    // Why: Creating participants is an admin-only action.
    try {
        await requireApiAuthUserId();
    } catch {
        return NextResponse.json({ok: false, error: "Unauthorized"}, {status: 401});
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ok: false, error: "Invalid JSON body."}, {status: 400});
    }

    const parsed = CreateParticipantSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            {ok: false, error: "Validation failed.", details: parsed.error.flatten()},
            {status: 400},
        );
    }

    const {studyId, assignedVariant, participantLabel} = parsed.data;

    // What: Side panel is strongly coupled to the variant.
    // Why: Keeps the experimental manipulation consistent and analysis clean.
    const sidePanelEnabled = assignedVariant === "VARIANT_2";

    try {
        const created = await prisma.participant.create({
            data: {
                studyId,
                assignedVariant,
                sidePanelEnabled,
                participantLabel: participantLabel || null,

                // What: Ensure a clean initial state.
                // Why: Prevent partial/undefined “progress” at creation time.
                status: "CREATED",
                currentStep: "WELCOME",
                currentTaskNumber: null,
                startedAt: null,
                completedAt: null,
                lastActiveAt: null,
                reentryCount: 0,
            },
            select: {
                id: true,
                accessCode: true,
                participantLabel: true,
                assignedVariant: true,
                sidePanelEnabled: true,
                status: true,
                currentStep: true,
                createdAt: true,
                study: {select: {id: true, key: true, name: true}},
            },
        });

        return NextResponse.json({ok: true, participant: created});
    } catch (err: any) {
        // What: Handle common unique constraint failures (accessCode/label).
        // Why: Admin should get a clear message instead of a generic 500.
        const message = typeof err?.message === "string" ? err.message : "Failed to create participant.";
        return NextResponse.json({ok: false, error: message}, {status: 500});
    }
}
