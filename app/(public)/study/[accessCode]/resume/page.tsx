/**
 * /study/[accessCode]/resume
 *
 * Purpose:
 * - Server-side routing decision:
 *   - Look up participant.currentStep in DB
 *   - Redirect to the correct page (pre, task chat, post, final, done)
 *
 * Planned behavior:
 * - Call an internal server action or DB query directly (preferred) and redirect.
 */

import ResumeClient from "@/app/modules/publicStudy/components/ResumeClient";

export default async function ResumePage({
                                             params,
                                         }: {
    params: Promise<{ accessCode: string }>;
}) {
    const {accessCode} = await params;
    return <ResumeClient accessCode={accessCode}/>;
}
