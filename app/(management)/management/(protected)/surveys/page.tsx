// app/(management)/management/(protected)/surveys/page.tsx
//
// Purpose:
// - Entry for management "Surveys" (actually Study configs).
// - Renders client list.

import SurveyListPageClient from "@/app/modules/management/surveys/components/SurveyListPageClient";

export default function ManagementSurveysPage() {
    return <SurveyListPageClient/>;
}
