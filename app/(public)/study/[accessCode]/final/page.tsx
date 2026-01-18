/**
 * /study/[accessCode]/final
 *
 * Purpose:
 * - Final survey after all tasks (overall trust, usability, etc.)
 *
 * Planned UI:
 * - Survey renderer
 * - On submit: persist answers, set participant.status=COMPLETED, participant.currentStep=DONE
 */

import FinalSurveyClient from "@/app/modules/publicStudy/components/FinalSurveyClient";

export default async function FinalSurveyPage({
                                                  params,
                                              }: {
    params: Promise<{ accessCode: string }>;
}) {
    const {accessCode} = await params;
    return <FinalSurveyClient accessCode={accessCode}/>;
}
