"use client";

// app/modules/management/dashboard/components/tabs/GeneralTab.tsx
//
// Purpose:
// - Extracted "General" tab from ManagementOverviewDashboard.tsx.
// - Keeps the main dashboard smaller and separates concerns.
// - Includes: Core KPIs, Variant/Sidepanel splits, and Survey Overview module.

import React, {useMemo} from "react";
import {formatDuration, percent} from "../format";
import SmallToggleButton from "../SmallToggleButton";
import {OverviewResponse, SurveyPhaseSummary} from "@/app/modules/management/dashboard/types";

type GeneralSurveyView = "all" | "one";

function phaseNiceLabel(phase: string): string {
    // Stable mapping for readability
    if (phase === "PRE") return "Pre-Survey";
    if (phase === "FINAL") return "Final-Survey";
    if (phase === "TASK1_POST") return "Task 1 Post-Survey";
    if (phase === "TASK2_POST") return "Task 2 Post-Survey";
    if (phase === "TASK3_POST") return "Task 3 Post-Survey";
    return phase;
}

function phaseSortKey(phase: string): number {
    if (phase === "PRE") return 0;
    if (phase === "TASK1_POST") return 2;
    if (phase === "TASK2_POST") return 4;
    if (phase === "TASK3_POST") return 6;
    if (phase === "FINAL") return 8;
    return 999;
}

export default function GeneralTab(props: {
    overview: Extract<OverviewResponse, { ok: true; mode: "study" }>;
    generalSurveyView: GeneralSurveyView;
    generalSurveyPhase: string;
    onChangeGeneralSurveyViewAction: (v: GeneralSurveyView) => void;
    onChangeGeneralSurveyPhaseAction: (phase: string) => void;
}) {
    const surveySummaries: SurveyPhaseSummary[] = useMemo(() => {
        const rows = props.overview.study.surveySummaries ?? [];
        return [...rows].sort((a, b) => phaseSortKey(String(a.phase)) - phaseSortKey(String(b.phase)));
    }, [props.overview.study.surveySummaries]);

    const surveyAggregate = useMemo(() => {
        // Aggregate over all phases:
        // - instancesTotal: sum
        // - submittedTotal: sum
        // - submissionRate: submittedTotal / instancesTotal (if >0)
        // - avgDurationMs: weighted average by submitted count (only where avgDurationMs exists)
        if (surveySummaries.length === 0) {
            return {
                instancesTotal: 0,
                submittedTotal: 0,
                submissionRate: null as number | null,
                avgDurationMs: null as number | null,
            };
        }

        const instancesTotal = surveySummaries.reduce((acc, r) => acc + Number(r.instancesTotal ?? 0), 0);
        const submittedTotal = surveySummaries.reduce((acc, r) => acc + Number(r.submittedTotal ?? 0), 0);

        // weighted avg (submitted-only)
        const weighted = surveySummaries
            .map((r) => {
                const n = Number(r.submittedTotal ?? 0);
                const m = r.avgDurationMs === null || r.avgDurationMs === undefined ? null : Number(r.avgDurationMs);
                return n > 0 && m !== null && Number.isFinite(m) ? {n, m} : null;
            })
            .filter((x): x is { n: number; m: number } => x !== null);

        const weightedSum = weighted.reduce((acc, x) => acc + x.n * x.m, 0);
        const weightedN = weighted.reduce((acc, x) => acc + x.n, 0);

        return {
            instancesTotal,
            submittedTotal,
            submissionRate: instancesTotal > 0 ? submittedTotal / instancesTotal : null,
            avgDurationMs: weightedN > 0 ? weightedSum / weightedN : null,
        };
    }, [surveySummaries]);

    const selectedSurveySummary = useMemo(() => {
        const found = surveySummaries.find((r) => String(r.phase) === String(props.generalSurveyPhase));
        return found ?? null;
    }, [surveySummaries, props.generalSurveyPhase]);

    return (
        <div className="space-y-4">
            {/* Core KPIs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">Participants</div>
                    <div className="text-2xl font-semibold text-slate-50">
                        {props.overview.study.kpis.participantsTotal}
                    </div>
                </div>

                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">Completed</div>
                    <div className="text-2xl font-semibold text-slate-50">
                        {props.overview.study.kpis.participantsCompleted}{" "}
                        <span className="text-sm font-medium text-slate-300">
                            ({percent(props.overview.study.kpis.completionRate)})
                        </span>
                    </div>
                </div>

                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">In Progress</div>
                    <div className="text-2xl font-semibold text-slate-50">
                        {props.overview.study.kpis.participantsInProgress}
                    </div>
                </div>

                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">Avg Duration (completed)</div>
                    <div className="text-2xl font-semibold text-slate-50">
                        {formatDuration(props.overview.study.kpis.avgTotalDurationMs)}
                    </div>
                </div>
            </div>

            {/* Variant + Sidepanel split */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">Variant Split</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {props.overview.study.kpis.variantSplit.length === 0 ? (
                            <span className="text-sm text-slate-400">—</span>
                        ) : (
                            props.overview.study.kpis.variantSplit.map((v) => (
                                <span
                                    key={v.variant}
                                    className="rounded-lg border border-rose-900/25 bg-black/20 px-2 py-1 text-sm text-slate-100"
                                >
                                    {v.variant}: <span className="font-semibold">{v.count}</span>
                                </span>
                            ))
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                    <div className="text-xs text-slate-400">Side Panel Enabled</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {props.overview.study.kpis.sidePanelEnabledSplit.length === 0 ? (
                            <span className="text-sm text-slate-400">—</span>
                        ) : (
                            props.overview.study.kpis.sidePanelEnabledSplit.map((v) => (
                                <span
                                    key={String(v.enabled)}
                                    className="rounded-lg border border-rose-900/25 bg-black/20 px-2 py-1 text-sm text-slate-100"
                                >
                                    {v.enabled ? "enabled" : "disabled"}:{" "}
                                    <span className="font-semibold">{v.count}</span>
                                </span>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Survey Overview (data-understanding module) */}
            <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-200">Survey Overview</div>
                        <div className="text-xs text-slate-400">
                            Ziel: Überblick über Submissions + Dauer — als „All Surveys“ oder „One Survey“.
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <SmallToggleButton
                            active={props.generalSurveyView === "all"}
                            label="All Surveys"
                            onClickAction={() => props.onChangeGeneralSurveyViewAction("all")}
                        />
                        <SmallToggleButton
                            active={props.generalSurveyView === "one"}
                            label="One Survey"
                            onClickAction={() => props.onChangeGeneralSurveyViewAction("one")}
                        />

                        {props.generalSurveyView === "one" ? (
                            <select
                                className="rounded-lg border border-rose-900/25 bg-black/15 px-2 py-1 text-xs text-slate-200"
                                value={props.generalSurveyPhase}
                                onChange={(e) => props.onChangeGeneralSurveyPhaseAction(e.target.value)}
                            >
                                {(surveySummaries.length > 0 ? surveySummaries : [{
                                    phase: "PRE",
                                    instancesTotal: 0,
                                    submittedTotal: 0,
                                    submissionRate: null,
                                    avgDurationMs: null
                                }]).map((s) => (
                                    <option key={String(s.phase)} value={String(s.phase)}>
                                        {phaseNiceLabel(String(s.phase))}
                                    </option>
                                ))}
                            </select>
                        ) : null}
                    </div>
                </div>

                {surveySummaries.length === 0 ? (
                    <div className="text-sm text-slate-400">
                        Keine Survey-Metriken verfügbar (noch keine Survey-Instances oder Backend liefert
                        surveySummaries nicht).
                    </div>
                ) : null}

                {props.generalSurveyView === "all" ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3">
                                <div className="text-xs text-slate-400">Survey Instances (total)</div>
                                <div className="text-lg font-semibold text-slate-50">
                                    {surveyAggregate.instancesTotal}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3">
                                <div className="text-xs text-slate-400">Submitted (total)</div>
                                <div className="text-lg font-semibold text-slate-50">
                                    {surveyAggregate.submittedTotal}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3">
                                <div className="text-xs text-slate-400">Submission Rate</div>
                                <div className="text-lg font-semibold text-slate-50">
                                    {percent(surveyAggregate.submissionRate)}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3">
                                <div className="text-xs text-slate-400">Avg Survey Duration</div>
                                <div className="text-lg font-semibold text-slate-50">
                                    {formatDuration(surveyAggregate.avgDurationMs)}
                                </div>
                            </div>
                        </div>

                        <div className="overflow-auto rounded-xl border border-rose-900/20">
                            <table className="w-full border-collapse text-sm">
                                <thead className="bg-black/20 text-slate-200">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Survey</th>
                                    <th className="px-3 py-2 text-right font-semibold">Instances</th>
                                    <th className="px-3 py-2 text-right font-semibold">Submitted</th>
                                    <th className="px-3 py-2 text-right font-semibold">Rate</th>
                                    <th className="px-3 py-2 text-right font-semibold">Avg Duration</th>
                                </tr>
                                </thead>
                                <tbody>
                                {surveySummaries.map((s) => (
                                    <tr key={String(s.phase)} className="border-t border-rose-900/15">
                                        <td className="px-3 py-2 text-slate-50">{phaseNiceLabel(String(s.phase))}</td>
                                        <td className="px-3 py-2 text-right text-slate-200">{Number(s.instancesTotal ?? 0)}</td>
                                        <td className="px-3 py-2 text-right text-slate-200">{Number(s.submittedTotal ?? 0)}</td>
                                        <td className="px-3 py-2 text-right text-slate-200">{percent(s.submissionRate ?? null)}</td>
                                        <td className="px-3 py-2 text-right text-slate-200">{formatDuration(s.avgDurationMs ?? null)}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="text-xs text-slate-400 space-y-1">
                            <p>
                                „Avg Survey Duration“ wird nur über{" "}
                                <span className="font-semibold text-slate-200">submitted</span> Surveys gerechnet
                                (startedAt → submittedAt).
                            </p>
                            <p>
                                Dadurch ist die Dauer interpretierbar und nicht durch offene/abgebrochene Sessions
                                verfälscht.
                            </p>
                        </div>
                    </div>
                ) : null}

                {props.generalSurveyView === "one" ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3">
                                <div className="text-xs text-slate-400">Survey</div>
                                <div className="text-lg font-semibold text-slate-50">
                                    {phaseNiceLabel(String(selectedSurveySummary?.phase ?? props.generalSurveyPhase))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3">
                                <div className="text-xs text-slate-400">Instances</div>
                                <div className="text-lg font-semibold text-slate-50">
                                    {selectedSurveySummary ? Number(selectedSurveySummary.instancesTotal ?? 0) : "—"}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3">
                                <div className="text-xs text-slate-400">Submitted</div>
                                <div className="text-lg font-semibold text-slate-50">
                                    {selectedSurveySummary ? Number(selectedSurveySummary.submittedTotal ?? 0) : "—"}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3">
                                <div className="text-xs text-slate-400">Submission Rate</div>
                                <div className="text-lg font-semibold text-slate-50">
                                    {selectedSurveySummary ? percent(selectedSurveySummary.submissionRate ?? null) : "—"}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3 sm:col-span-2">
                                <div className="text-xs text-slate-400">Avg Duration (submitted only)</div>
                                <div className="text-lg font-semibold text-slate-50">
                                    {selectedSurveySummary ? formatDuration(selectedSurveySummary.avgDurationMs ?? null) : "—"}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-3 sm:col-span-2">
                                <div className="text-xs text-slate-400">Interpretation hint</div>
                                <div className="text-sm text-slate-200">
                                    Hohe Abbruchrate oder lange Dauer können auf Verständlichkeit/Usability-Probleme
                                    hindeuten —
                                    besonders bei TASKx_POST (direkt nach Chat).
                                </div>
                            </div>
                        </div>

                        <div className="text-xs text-slate-400">
                            Hinweis: Diese Übersicht ist bewusst „high-level“. Details zu einzelnen Fragen findest du im
                            Surveys-Tab.
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
