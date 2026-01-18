"use client";

// app/modules/management/dashboard/components/tabs/TasksTab.tsx
//
// Purpose:
// - Extracted "Tasks" tab rendering from ManagementOverviewDashboard.tsx.
// - Keeps dashboard modular and reduces file size.
//
// Notes:
// - Uses typed TaskSummary fields (including post-survey extensions).

import React from "react";
import {formatDuration, percent} from "../format";
import {OverviewResponse} from "@/app/modules/management/dashboard/types";

export default function TasksTab(props: {
    overview: Extract<OverviewResponse, { ok: true; mode: "study" }>;
}) {
    return (
        <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-200">Tasks</div>
                <div className="text-xs text-slate-400">
                    Chat + Post-Survey getrennt (Ø-Werte) • Sidepanel: Adoption + Intensität
                </div>
            </div>

            <div className="mt-1 overflow-auto rounded-xl border border-rose-900/20">
                <table className="w-full border-collapse text-sm">
                    <thead className="bg-black/20 text-slate-200">
                    <tr>
                        <th className="px-3 py-2 text-left font-semibold">Task</th>
                        <th className="px-3 py-2 text-left font-semibold">Part</th>
                        <th className="px-3 py-2 text-right font-semibold">Sessions</th>
                        <th className="px-3 py-2 text-right font-semibold">Completed</th>
                        <th className="px-3 py-2 text-right font-semibold">Avg Duration</th>
                        <th className="px-3 py-2 text-right font-semibold">Avg Msg (User/Asst)</th>
                        <th className="px-3 py-2 text-right font-semibold">Avg Restarts</th>
                        <th className="px-3 py-2 text-right font-semibold">Sidepanel Time (Avg)</th>
                        <th className="px-3 py-2 text-right font-semibold">Sidepanel Usage</th>
                        <th className="px-3 py-2 text-right font-semibold">Opens / Session</th>
                    </tr>
                    </thead>
                    <tbody>
                    {props.overview.study.taskSummaries.length === 0 ? (
                        <tr>
                            <td className="px-3 py-3 text-slate-400" colSpan={10}>
                                No task sessions yet.
                            </td>
                        </tr>
                    ) : (
                        props.overview.study.taskSummaries.flatMap((t) => {
                            const chatCompleted = t.readyToAnswerCount;
                            const postStarted = t.postSurveyStartedCount;
                            const postCompleted = t.postSurveySubmittedCount;

                            const avgPostMs = t.avgPostSurveyDurationMs ?? null;
                            const avgRestarts = t.avgRestarts ?? null;

                            // Sidepanel metrics:
                            // - We prefer session-based usage rate from backend (valid even if panel remains open).
                            // - Fallbacks are kept minimal to avoid breaking the UI if types are not yet updated.
                            const anyT = t as any;

                            const sidePanelUsageRate =
                                typeof anyT.sidePanelUsageRate === "number" && Number.isFinite(anyT.sidePanelUsageRate)
                                    ? (anyT.sidePanelUsageRate as number)
                                    : null;

                            const avgSidePanelOpens =
                                typeof anyT.avgSidePanelOpens === "number" && Number.isFinite(anyT.avgSidePanelOpens)
                                    ? (anyT.avgSidePanelOpens as number)
                                    : null;

                            // Older payload already has sidePanelOpenCountTotal; compute "opens per session" as fallback.
                            const sidePanelOpenCountTotal =
                                typeof anyT.sidePanelOpenCountTotal === "number" && Number.isFinite(anyT.sidePanelOpenCountTotal)
                                    ? (anyT.sidePanelOpenCountTotal as number)
                                    : null;

                            const opensPerSessionFallback =
                                sidePanelOpenCountTotal !== null && t.sessionsTotal > 0
                                    ? sidePanelOpenCountTotal / t.sessionsTotal
                                    : null;

                            const opensPerSession = avgSidePanelOpens ?? opensPerSessionFallback;

                            const chatRow = (
                                <tr key={`t${t.taskNumber}-chat`} className="border-t border-rose-900/15">
                                    <td className="px-3 py-2 text-slate-50">Task {t.taskNumber}</td>
                                    <td className="px-3 py-2 text-slate-200">
                                        <span
                                            className="rounded-md border border-rose-900/25 bg-black/15 px-2 py-0.5 text-xs">
                                            Chat
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-200">{t.sessionsTotal}</td>
                                    <td className="px-3 py-2 text-right text-slate-200">{chatCompleted}</td>
                                    <td className="px-3 py-2 text-right text-slate-200">{formatDuration(t.avgChatDurationMs)}</td>
                                    <td className="px-3 py-2 text-right text-slate-200">
                                        {t.avgUserMessages === null || t.avgAssistantMessages === null
                                            ? "—"
                                            : `${t.avgUserMessages.toFixed(1)} / ${t.avgAssistantMessages.toFixed(1)}`}
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-200">
                                        {avgRestarts === null ? "—" : avgRestarts.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-200">{formatDuration(t.avgSidePanelOpenMs)}</td>
                                    <td className="px-3 py-2 text-right text-slate-200">
                                        {percent(sidePanelUsageRate)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-200">
                                        {opensPerSession === null ? "—" : opensPerSession.toFixed(2)}
                                    </td>
                                </tr>
                            );

                            const postRow = (
                                <tr key={`t${t.taskNumber}-post`} className="border-t border-rose-900/10 bg-black/10">
                                    <td className="px-3 py-2 text-slate-50">Task {t.taskNumber}</td>
                                    <td className="px-3 py-2 text-slate-200">
                                        <span
                                            className="rounded-md border border-rose-900/25 bg-black/15 px-2 py-0.5 text-xs">
                                            Post-Survey
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-200">{t.sessionsTotal}</td>
                                    <td className="px-3 py-2 text-right text-slate-200">
                                        {postStarted > 0 ? `${postCompleted}/${postStarted}` : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-200">{formatDuration(avgPostMs)}</td>
                                    <td className="px-3 py-2 text-right text-slate-500">—</td>
                                    <td className="px-3 py-2 text-right text-slate-500">—</td>
                                    <td className="px-3 py-2 text-right text-slate-500">—</td>
                                    <td className="px-3 py-2 text-right text-slate-500">—</td>
                                    <td className="px-3 py-2 text-right text-slate-500">—</td>
                                </tr>
                            );

                            return [chatRow, postRow];
                        })
                    )}
                    </tbody>
                </table>
            </div>

            <div className="text-xs text-slate-400 space-y-1">
                <p>
                    Hinweis Chat-Zeit: <span className="font-semibold text-slate-200">chatStartedAt</span> bis{" "}
                    <span className="font-semibold text-slate-200">chatEndedAt</span> (oder{" "}
                    <span className="font-semibold text-slate-200">readyToAnswerAt</span>).
                </p>
                <p>
                    Hinweis Post-Survey-Zeit: <span
                    className="font-semibold text-slate-200">postSurveyStartedAt</span> bis{" "}
                    <span className="font-semibold text-slate-200">postSurveySubmittedAt</span> (TaskSession-Level).
                </p>
                <p>
                    „Avg Msg (User/Asst)“ = durchschnittliche Anzahl User- bzw. Assistant-Nachrichten pro TaskSession
                    (über alle Threads).
                </p>
                <p>
                    Sidepanel:
                    <span className="font-semibold text-slate-200"> Usage</span> misst Adoption als Anteil Sessions
                    mit{" "}
                    <span className="font-semibold text-slate-200">sidePanelOpenCount &gt; 0</span> (unabhängig davon,
                    ob ein Close-Event stattgefunden hat).
                    <span className="font-semibold text-slate-200"> Opens / Session</span> zeigt Intensität (wie oft
                    geöffnet).
                </p>
            </div>
        </div>
    );
}
