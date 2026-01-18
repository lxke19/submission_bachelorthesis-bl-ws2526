"use client";

// app/modules/management/dashboard/components/SmallToggleButton.tsx
//
// Purpose:
// - Reusable compact toggle button used in Survey Overview module.
// - Avoids inline components and keeps the main dashboard file smaller.

import React from "react";

export default function SmallToggleButton(props: {
    active: boolean;
    label: string;
    onClickAction: () => void;
}) {
    return (
        <button
            type="button"
            onClick={props.onClickAction}
            className={[
                "rounded-lg px-2 py-1 text-xs font-semibold transition-colors",
                "border border-rose-900/25 bg-black/15",
                props.active ? "bg-rose-900/35 text-rose-100" : "text-slate-300 hover:bg-rose-900/20 hover:text-slate-50",
            ].join(" ")}
        >
            {props.label}
        </button>
    );
}
