"use client";

// app/modules/management/dashboard/components/tabs/SurveysTab.tsx
//
// Purpose:
// - Extracted "Surveys" tab rendering (analytics per phase/question).
// - Uses Answers modal opener callback to keep responsibilities separated.

import React from "react";
import {Button} from "@/components/ui/button";
import {SurveyAnalyticsPhaseBlock} from "@/app/modules/management/dashboard/api";

export default function SurveysTab(props: {
    activeStudyId: string | null;
    surveyAnalytics: SurveyAnalyticsPhaseBlock[] | null;
    surveyLoading: boolean;
    surveyError: string | null;
    onOpenAnswersAction: (args: { studyId: string; phase: string; questionId: string; title: string }) => void;
}) {
    return (
        <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-200">Surveys</div>
                <div className="text-xs text-slate-400">Aggregates per question (submitted only)</div>
            </div>

            {props.surveyLoading ? <div className="text-sm text-slate-400">Lade Survey Analytics...</div> : null}
            {props.surveyError ? <div className="text-sm text-rose-300">{props.surveyError}</div> : null}

            {props.surveyAnalytics && props.surveyAnalytics.length === 0 ? (
                <div className="text-sm text-slate-400">No survey submissions yet.</div>
            ) : null}

            {props.surveyAnalytics && props.surveyAnalytics.length > 0 ? (
                <div className="space-y-4">
                    {props.surveyAnalytics.map((phase) => (
                        <div key={phase.phase} className="rounded-2xl border border-rose-900/20 bg-black/15 p-4">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm font-semibold text-slate-200">
                                    {phase.phase}{" "}
                                    <span className="text-xs font-normal text-slate-400">
                                        ({phase.templateKey ?? "no-template"} • {phase.submittedTotal} submitted)
                                    </span>
                                </div>
                                <div className="text-xs text-slate-400">{phase.templateName ?? "—"}</div>
                            </div>

                            <div className="mt-3 overflow-auto rounded-xl border border-rose-900/15">
                                <table className="w-full border-collapse text-sm">
                                    <thead className="bg-black/20 text-slate-200">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">Question</th>
                                        <th className="px-3 py-2 text-left font-semibold">Key</th>
                                        <th className="px-3 py-2 text-left font-semibold">Type</th>
                                        <th className="px-3 py-2 text-right font-semibold">n</th>
                                        <th className="px-3 py-2 text-right font-semibold">Summary</th>
                                        <th className="px-3 py-2 text-right font-semibold">Details</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {phase.questions.length === 0 ? (
                                        <tr>
                                            <td className="px-3 py-3 text-slate-400" colSpan={6}>
                                                No questions found for this phase/template.
                                            </td>
                                        </tr>
                                    ) : (
                                        phase.questions.map((q) => (
                                            <tr key={q.questionId} className="border-t border-rose-900/10">
                                                <td className="px-3 py-2 text-slate-50">{q.text}</td>
                                                <td className="px-3 py-2 text-slate-300">{q.key}</td>
                                                <td className="px-3 py-2 text-slate-300">{q.type}</td>
                                                <td className="px-3 py-2 text-right text-slate-200">{q.n}</td>
                                                <td className="px-3 py-2 text-right text-slate-200">
                                                    {"mean" in q
                                                        ? q.mean === null
                                                            ? "—"
                                                            : `mean ${q.mean.toFixed(2)} (min ${q.min ?? "—"}, max ${q.max ?? "—"})`
                                                        : "options" in q
                                                            ? `${q.options.reduce((acc, o) => acc + o.count, 0)} selections`
                                                            : `non-empty ${q.nonEmpty}`}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="border-rose-900/40 bg-black/20 text-slate-50 hover:bg-rose-900/25"
                                                        disabled={!props.activeStudyId || phase.submittedTotal === 0}
                                                        onClick={() => {
                                                            if (!props.activeStudyId) return;
                                                            props.onOpenAnswersAction({
                                                                studyId: props.activeStudyId,
                                                                phase: phase.phase,
                                                                questionId: q.questionId,
                                                                title: `${phase.phase} • ${q.key}`,
                                                            });
                                                        }}
                                                    >
                                                        Show Results
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
