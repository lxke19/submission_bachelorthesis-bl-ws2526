"use client";

// app/modules/management/dashboard/components/TabButton.tsx
//
// Purpose:
// - Small reusable tab button for dashboard tabs.
// - Keeps ManagementOverviewDashboard.tsx lean and avoids inline component definitions.

import React from "react";

export type DashboardTabKey = "general" | "tasks" | "surveys" | "participants" | "exports";

export default function TabButton(props: {
    id: DashboardTabKey;
    label: string;
    active: boolean;
    onClickAction: (id: DashboardTabKey) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => props.onClickAction(props.id)}
            className={[
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "hover:bg-rose-900/25 hover:text-rose-100",
                props.active ? "bg-rose-900/35 text-rose-100" : "text-slate-200",
            ].join(" ")}
        >
            {props.label}
        </button>
    );
}
