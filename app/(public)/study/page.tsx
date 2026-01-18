/**
 * /study
 *
 * Purpose:
 * - Entry point for participants.
 * - Here we will later show the access code input ("Probanden-ID") and start the study.
 *
 * Planned UI:
 * - Input field for accessCode
 * - Submit -> redirect to /study/[accessCode]/resume (server decides next step)
 */

import StudyEntryClient from "@/app/modules/publicStudy/components/StudyEntryClient";

export default function StudyEntryPage() {
    return <StudyEntryClient/>;
}
