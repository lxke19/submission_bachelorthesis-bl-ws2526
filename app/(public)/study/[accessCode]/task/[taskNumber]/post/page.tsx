/**
 * /study/[accessCode]/task/[taskNumber]/post
 *
 * Purpose:
 * - Post-task survey after chat (confidence, trust, perceived helpfulness, etc.)
 *
 * Planned UI:
 * - Survey renderer
 * - On submit: persist answers, mark taskSession.postSurveySubmittedAt,
 *   update participant.currentStep to next task or final
 */

import TaskPostSurveyClient from "@/app/modules/publicStudy/components/TaskPostSurveyClient";

export default async function TaskPostSurveyPage({
                                                     params,
                                                 }: {
    params: Promise<{ accessCode: string; taskNumber: string }>;
}) {
    const {accessCode, taskNumber} = await params;
    return <TaskPostSurveyClient accessCode={accessCode} taskNumber={taskNumber}/>;
}
