// app/api/management/study/[studyId]/survey-analytics/route.ts
//
// Purpose:
// - Admin-only: aggregated survey analytics per phase and per question.
// - Returns only submitted instances (so analysis isn't polluted by partial drafts).
//
// Notes:
// - TEXT answers are NOT returned here (only counts). Raw answers are fetched on demand.
// - MULTI_CHOICE counts are based on join rows (SurveyAnswerOption).
// - SINGLE_CHOICE counts are based on selectedOptionId.

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireAuthenticatedUser} from "@/app/lib/auth";

function avg(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ studyId: string }> }) {
    const user = await requireAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ok: false, error: "Unauthorized"}, {status: 401});
    }

    const {studyId} = await ctx.params;

    // Load templates and questions/options (study structure)
    const templates = await prisma.surveyTemplate.findMany({
        where: {studyId},
        select: {
            id: true,
            key: true,
            name: true,
            questions: {
                orderBy: [{order: "asc"}],
                select: {
                    id: true,
                    key: true,
                    text: true,
                    type: true,
                    required: true,
                    scaleMin: true,
                    scaleMax: true,
                    scaleStep: true,
                    options: {
                        orderBy: [{order: "asc"}],
                        select: {id: true, value: true, label: true},
                    },
                },
            },
        },
    });

    // Load submitted instances only
    const instances = await prisma.surveyInstance.findMany({
        where: {participant: {studyId}, submittedAt: {not: null}},
        select: {id: true, phase: true, surveyTemplateId: true},
    });

    if (instances.length === 0) {
        // Still return phases that exist in templates? We keep it simple: return empty.
        return NextResponse.json({ok: true, phases: []});
    }

    const phaseKeys = Array.from(new Set(instances.map((i) => i.phase))).sort();

    const phases = await Promise.all(
        phaseKeys.map(async (phase) => {
            const phaseInstances = instances.filter((i) => i.phase === phase);
            const instanceIds = phaseInstances.map((i) => i.id);

            // Find template (if consistent). If multiple templates exist for same phase (shouldn't), we just show first.
            const templateId = phaseInstances[0]?.surveyTemplateId ?? null;
            const tmpl = templateId ? templates.find((t) => t.id === templateId) : null;

            const answers = await prisma.surveyAnswer.findMany({
                where: {surveyInstanceId: {in: instanceIds}},
                select: {
                    questionId: true,
                    numericValue: true,
                    selectedOptionId: true,
                    textValue: true,
                    selectedOptions: {select: {optionId: true}},
                },
            });

            const questions = (tmpl?.questions ?? []).map((q) => {
                const qAnswers = answers.filter((a) => a.questionId === q.id);

                if (q.type === "SCALE_NRS") {
                    const nums = qAnswers
                        .map((a) => (typeof a.numericValue === "number" ? a.numericValue : null))
                        .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

                    const mean = avg(nums);
                    const min = nums.length ? Math.min(...nums) : null;
                    const max = nums.length ? Math.max(...nums) : null;

                    return {
                        questionId: q.id,
                        key: q.key,
                        text: q.text,
                        type: "SCALE_NRS" as const,
                        required: q.required,
                        n: nums.length,
                        mean,
                        min,
                        max,
                    };
                }

                if (q.type === "TEXT") {
                    const nonEmpty = qAnswers
                        .map((a) => (a.textValue ?? "").trim())
                        .filter((t) => t.length > 0).length;

                    return {
                        questionId: q.id,
                        key: q.key,
                        text: q.text,
                        type: "TEXT" as const,
                        required: q.required,
                        n: qAnswers.length,
                        nonEmpty,
                    };
                }

                if (q.type === "SINGLE_CHOICE") {
                    const counts = new Map<string, number>();
                    for (const a of qAnswers) {
                        if (!a.selectedOptionId) continue;
                        counts.set(a.selectedOptionId, (counts.get(a.selectedOptionId) ?? 0) + 1);
                    }

                    const options = q.options.map((o) => ({
                        optionId: o.id,
                        value: o.value,
                        label: o.label,
                        count: counts.get(o.id) ?? 0,
                    }));

                    return {
                        questionId: q.id,
                        key: q.key,
                        text: q.text,
                        type: "SINGLE_CHOICE" as const,
                        required: q.required,
                        n: qAnswers.length,
                        options,
                    };
                }

                // MULTI_CHOICE
                const counts = new Map<string, number>();
                for (const a of qAnswers) {
                    for (const sel of a.selectedOptions) {
                        counts.set(sel.optionId, (counts.get(sel.optionId) ?? 0) + 1);
                    }
                }

                const options = q.options.map((o) => ({
                    optionId: o.id,
                    value: o.value,
                    label: o.label,
                    count: counts.get(o.id) ?? 0,
                }));

                return {
                    questionId: q.id,
                    key: q.key,
                    text: q.text,
                    type: "MULTI_CHOICE" as const,
                    required: q.required,
                    n: qAnswers.length,
                    options,
                };
            });

            return {
                phase,
                templateKey: tmpl?.key ?? null,
                templateName: tmpl?.name ?? null,
                submittedTotal: phaseInstances.length,
                questions,
            };
        }),
    );

    return NextResponse.json({ok: true, phases});
}
