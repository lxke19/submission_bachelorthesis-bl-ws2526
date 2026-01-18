/**
 * /study/[accessCode]/pre
 *
 * Purpose:
 * - Pre-survey (baseline questionnaire) before tasks.
 *
 * Planned UI:
 * - Survey renderer (mostly scales like 1..10, single-choice, multi-choice)
 * - Validation: required questions must be answered
 * - On submit: persist SurveyInstance + SurveyAnswers, update participant.currentStep
 */

import PreSurveyClient from "@/app/modules/publicStudy/components/PreSurveyClient";

export default async function PreSurveyPage({
                                                params,
                                            }: {
    params: Promise<{ accessCode: string }>;
}) {
    const {accessCode} = await params;
    return <PreSurveyClient accessCode={accessCode}/>;
}
