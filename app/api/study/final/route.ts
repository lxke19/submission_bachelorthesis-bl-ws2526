// app/api/study/final/route.ts
//
// Purpose:
// - Load FINAL survey template.
// - Ensure SurveyInstance exists for FINAL.
//
// Why:
// - Standardized final measurement, stored like other surveys.

import {NextRequest, NextResponse} from "next/server";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {prisma} from "@/app/lib/prisma";
import {stepToPath} from "@/app/modules/publicStudy/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const auth = await requireStudyParticipant(req);
    if (!auth.ok) return NextResponse.json({ok: false, error: auth.error}, {status: auth.status});

    const p = auth.participant;

    if (p.currentStep !== "FINAL_SURVEY") {
        return NextResponse.json({
            ok: false,
            error: "Wrong step.",
            redirectTo: stepToPath(p.accessCode, p.currentStep as any, p.currentTaskNumber),
        }, {status: 409});
    }

    const template = await prisma.surveyTemplate.findFirst({
        where: {studyId: p.studyId, key: "final"},
        include: {
            questions: {orderBy: {order: "asc"}, include: {options: {orderBy: {order: "asc"}}}},
        },
    });

    if (!template) return NextResponse.json({ok: false, error: "Final survey template not found."}, {status: 500});

    await prisma.surveyInstance.upsert({
        where: {participantId_phase: {participantId: p.id, phase: "FINAL"}},
        update: {},
        create: {participantId: p.id, surveyTemplateId: template.id, phase: "FINAL"},
    });

    return NextResponse.json({
        ok: true,
        phase: "FINAL",
        title: template.name,
        questions: template.questions.map((q) => ({
            id: q.id,
            key: q.key,
            text: q.text,
            type: q.type,
            required: q.required,
            order: q.order,
            scaleMin: q.scaleMin,
            scaleMax: q.scaleMax,
            scaleStep: q.scaleStep,
            options: q.options.map((o) => ({id: o.id, value: o.value, label: o.label, order: o.order})),
        })),
    });
}
