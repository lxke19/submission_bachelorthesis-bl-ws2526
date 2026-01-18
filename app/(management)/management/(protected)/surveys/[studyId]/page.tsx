// app/(management)/management/(protected)/surveys/[studyId]/page.tsx
//
// Purpose:
// - Read-only details view for one study.

import SurveyDetailsPageClient from "@/app/modules/management/surveys/components/SurveyDetailsPageClient";

export default async function ManagementSurveyDetailsPage({
                                                              params,
                                                          }: {
    params: Promise<{ studyId: string }>;
}) {
    const {studyId} = await params;
    return <SurveyDetailsPageClient studyId={studyId}/>;
}
