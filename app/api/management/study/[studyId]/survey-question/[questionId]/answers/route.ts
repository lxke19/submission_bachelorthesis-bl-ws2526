// app/api/management/study/[studyId]/survey-question/[questionId]/answers/route.ts
//
// Purpose:
// - Admin-only: return raw answers for ONE question within ONE phase.
// - Used for "Show Results" popup (includes participantLabel + accessCode).
//
// Query params:
// - phase=PRE|TASK1_POST|TASK2_POST|TASK3_POST|FINAL (required)
//
// Notes:
// - For MULTI_CHOICE we return a string[] of selected option labels (ordered by option.order).

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireAuthenticatedUser} from "@/app/lib/auth";

const ALLOWED_SURVEY_PHASES = ["PRE", "TASK1_POST", "TASK2_POST", "TASK3_POST", "FINAL"] as const;
type AllowedSurveyPhase = (typeof ALLOWED_SURVEY_PHASES)[number];

function isAllowedSurveyPhase(x: string): x is AllowedSurveyPhase {
    return (ALLOWED_SURVEY_PHASES as readonly string[]).includes(x);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ studyId: string; questionId: string }> }) {
    const user = await requireAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ok: false, error: "Unauthorized"}, {status: 401});
    }

    const {studyId, questionId} = await ctx.params;
    const url = new URL(req.url);
    const phaseRaw = url.searchParams.get("phase");

    if (!phaseRaw) {
        return NextResponse.json({ok: false, error: "Missing phase param"}, {status: 400});
    }

    if (!isAllowedSurveyPhase(phaseRaw)) {
        return NextResponse.json({ok: false, error: `Invalid phase param: ${phaseRaw}`}, {status: 400});
    }

    const phase: AllowedSurveyPhase = phaseRaw;

    // Find submitted instances for this phase in this study
    const instances = await prisma.surveyInstance.findMany({
        where: {
            participant: {studyId},
            phase,
            submittedAt: {not: null},
        },
        select: {
            id: true,
            submittedAt: true,
            participant: {select: {participantLabel: true, accessCode: true}},
        },
    });

    if (instances.length === 0) {
        return NextResponse.json({ok: true, rows: []});
    }

    const instanceIds = instances.map((i) => i.id);

    const answers = await prisma.surveyAnswer.findMany({
        where: {surveyInstanceId: {in: instanceIds}, questionId},
        select: {
            surveyInstanceId: true,
            numericValue: true,
            textValue: true,
            selectedOption: {select: {label: true, value: true}},
            selectedOptions: {
                select: {
                    option: {select: {label: true, value: true, order: true}},
                },
                orderBy: {option: {order: "asc"}},
            },
            surveyInstance: {
                select: {
                    submittedAt: true,
                    participant: {select: {participantLabel: true, accessCode: true}},
                },
            },
            question: {select: {type: true}},
        },
    });

    const rows = answers.map((a) => {
        const label = a.surveyInstance.participant.participantLabel ?? null;
        const accessCode = a.surveyInstance.participant.accessCode;
        const submittedAt = a.surveyInstance.submittedAt ? a.surveyInstance.submittedAt.toISOString() : null;

        if (a.question.type === "SCALE_NRS") {
            return {participantLabel: label, accessCode, submittedAt, value: a.numericValue ?? null};
        }

        if (a.question.type === "TEXT") {
            return {participantLabel: label, accessCode, submittedAt, value: a.textValue ?? ""};
        }

        if (a.question.type === "SINGLE_CHOICE") {
            return {participantLabel: label, accessCode, submittedAt, value: a.selectedOption?.label ?? ""};
        }

        // MULTI_CHOICE
        const arr = a.selectedOptions.map((x) => x.option.label);
        return {participantLabel: label, accessCode, submittedAt, value: arr};
    });

    return NextResponse.json({ok: true, rows});
}
