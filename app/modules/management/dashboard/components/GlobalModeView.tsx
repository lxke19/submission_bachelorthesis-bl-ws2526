"use client";

// app/modules/management/dashboard/components/GlobalModeView.tsx
//
// Purpose:
// - Renders the "mode=all" view (global KPIs + study breakdown table).
// - Extracted from ManagementOverviewDashboard.tsx to keep it readable and modular.
//
// PATCH (Click-to-drilldown)
// --------------------------
// - Make each Study row clickable.
// - Clicking a row selects the study in the parent dashboard (via onSelectStudyAction).
// - This mirrors the “Participants click -> open modal” mental model, but for study selection.

import React from "react";
import {formatDuration, percent} from "./format";
import type {OverviewResponse} from "../types";

export default function GlobalModeView(props: {
    overview: Extract<OverviewResponse, { ok: true; mode: "all" }>;
    onSelectStudyAction?: (studyId: string) => void;
}) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">Studies</div>
                    <div className="text-2xl font-semibold text-slate-50">
                        {props.overview.global.kpis.studiesTotal}
                    </div>
                </div>

                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">Participants</div>
                    <div className="text-2xl font-semibold text-slate-50">
                        {props.overview.global.kpis.participantsTotal}
                    </div>
                </div>

                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">Completed</div>
                    <div className="text-2xl font-semibold text-slate-50">
                        {props.overview.global.kpis.participantsCompleted}{" "}
                        <span className="text-sm font-medium text-slate-300">
                            ({percent(props.overview.global.kpis.completionRate)})
                        </span>
                    </div>
                </div>

                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">Avg Duration (completed)</div>
                    <div className="text-2xl font-semibold text-slate-50">
                        {formatDuration(props.overview.global.kpis.avgTotalDurationMs)}
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-200">Study Breakdown</div>
                    <div className="text-xs text-slate-400">All Studies overview</div>
                </div>

                <div className="mt-3 overflow-auto rounded-xl border border-rose-900/20">
                    <table className="w-full border-collapse text-sm">
                        <thead className="bg-black/20 text-slate-200">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold">Study</th>
                            <th className="px-3 py-2 text-left font-semibold">Key</th>
                            <th className="px-3 py-2 text-right font-semibold">Participants</th>
                            <th className="px-3 py-2 text-right font-semibold">Completed</th>
                            <th className="px-3 py-2 text-right font-semibold">Rate</th>
                            <th className="px-3 py-2 text-right font-semibold">Avg Duration</th>
                        </tr>
                        </thead>
                        <tbody>
                        {props.overview.global.breakdown.length === 0 ? (
                            <tr>
                                <td className="px-3 py-3 text-slate-400" colSpan={6}>
                                    No studies found.
                                </td>
                            </tr>
                        ) : (
                            props.overview.global.breakdown.map((r) => {
                                const clickable = typeof props.onSelectStudyAction === "function";
                                return (
                                    <tr
                                        key={r.studyId}
                                        className={[
                                            "border-t border-rose-900/15",
                                            clickable ? "cursor-pointer hover:bg-rose-900/10" : "",
                                        ].join(" ")}
                                        onClick={() => clickable && props.onSelectStudyAction?.(r.studyId)}
                                        role={clickable ? "button" : undefined}
                                        tabIndex={clickable ? 0 : undefined}
                                        onKeyDown={(e) => {
                                            if (!clickable) return;
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                props.onSelectStudyAction?.(r.studyId);
                                            }
                                        }}
                                    >
                                        <td className="px-3 py-2 text-slate-50">
                                            <span
                                                className={clickable ? "underline decoration-rose-900/40 underline-offset-2" : ""}>
                                                {r.name}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-300">{r.key}</td>
                                        <td className="px-3 py-2 text-right text-slate-200">{r.participantsTotal}</td>
                                        <td className="px-3 py-2 text-right text-slate-200">{r.participantsCompleted}</td>
                                        <td className="px-3 py-2 text-right text-slate-200">{percent(r.completionRate)}</td>
                                        <td className="px-3 py-2 text-right text-slate-200">{formatDuration(r.avgTotalDurationMs)}</td>
                                    </tr>
                                );
                            })
                        )}
                        </tbody>
                    </table>
                </div>

                <p className="mt-3 text-xs text-slate-400">
                    Hinweis: Alle Zeiten/Ø-Werte sind nur über{" "}
                    <span className="font-semibold text-slate-200">abgeschlossene</span> Teilnahmen berechnet.
                </p>
            </div>
        </div>
    );
}
