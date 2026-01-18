// app/(management)/management/(protected)/dashboard/page.tsx
//
// Platzhalter-Übersicht für Admin.
// Später: Links zu Modulen (Agent Chat UI, Users, Settings, etc.)

import ManagementOverviewDashboard from "@/app/modules/management/dashboard/components/ManagementOverviewDashboard";

export default function ManagementOverviewPage() {
    return (
        <div className="space-y-4">
            <ManagementOverviewDashboard/>
        </div>
    );
}
