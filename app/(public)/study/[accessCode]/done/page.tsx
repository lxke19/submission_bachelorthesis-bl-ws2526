/**
 * /study/[accessCode]/done
 *
 * Purpose:
 * - Completion screen.
 * - If participant already completed, show "already participated".
 *
 * Planned UI:
 * - Thank you text
 * - Contact info for study lead if issues occur
 */

import DoneClient from "@/app/modules/publicStudy/components/DoneClient";

export default async function DonePage({
                                           params,
                                       }: {
    params: Promise<{ accessCode: string }>;
}) {
    const {accessCode} = await params;
    return <DoneClient accessCode={accessCode}/>;
}
