"use client";

// app/modules/management/dashboard/components/tabs/ParticipantsTab.tsx
//
// Purpose:
// - Extracted "Participants" tab table rendering.
// - Keeps ManagementOverviewDashboard.tsx focused on orchestration and state.

import React from "react";
import {ParticipantsListItem} from "@/app/modules/management/dashboard/api";

export default function ParticipantsTab(props: {
    participants: ParticipantsListItem[] | null;
    participantsLoading: boolean;
    participantsError: string | null;
    onOpenParticipantAction: (p: ParticipantsListItem) => void;
}) {
    return (
        <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-200">Participants</div>
                <div className="text-xs text-slate-400">Click a row for details (incl. chat transcript)</div>
            </div>

            {props.participantsLoading ? <div className="text-sm text-slate-400">Lade Participants...</div> : null}
            {props.participantsError ? <div className="text-sm text-rose-300">{props.participantsError}</div> : null}

            {props.participants && props.participants.length === 0 ? (
                <div className="text-sm text-slate-400">No participants in this study.</div>
            ) : null}

            {props.participants && props.participants.length > 0 ? (
                <div className="overflow-auto rounded-xl border border-rose-900/20">
                    <table className="w-full border-collapse text-sm">
                        <thead className="bg-black/20 text-slate-200">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold">Label</th>
                            <th className="px-3 py-2 text-left font-semibold">Access Code</th>
                            <th className="px-3 py-2 text-left font-semibold">Status</th>
                            <th className="px-3 py-2 text-left font-semibold">Step</th>
                            <th className="px-3 py-2 text-right font-semibold">Task</th>
                            <th className="px-3 py-2 text-left font-semibold">Variant</th>
                            <th className="px-3 py-2 text-left font-semibold">Sidepanel</th>
                        </tr>
                        </thead>
                        <tbody>
                        {props.participants.map((p) => (
                            <tr
                                key={p.id}
                                className="border-t border-rose-900/15 hover:bg-rose-900/10 cursor-pointer"
                                onClick={() => props.onOpenParticipantAction(p)}
                            >
                                <td className="px-3 py-2 text-slate-50">{p.participantLabel ?? "—"}</td>
                                <td className="px-3 py-2 text-slate-300">{p.accessCode}</td>
                                <td className="px-3 py-2 text-slate-200">{p.status}</td>
                                <td className="px-3 py-2 text-slate-200">{p.currentStep}</td>
                                <td className="px-3 py-2 text-right text-slate-200">{p.currentTaskNumber ?? "—"}</td>
                                <td className="px-3 py-2 text-slate-200">{p.assignedVariant}</td>
                                <td className="px-3 py-2 text-slate-200">{p.sidePanelEnabled ? "enabled" : "disabled"}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </div>
    );
}
