"use client";

// app/modules/management/dashboard/components/AnswersModal.tsx
//
// Purpose:
// - Dedicated modal for survey question raw answer listing.
// - Keeps ManagementOverviewDashboard.tsx smaller and more readable.

import React from "react";
import {Button} from "@/components/ui/button";
import type {SurveyQuestionAnswerRow} from "../api";

export default function AnswersModal(props: {
    title: string;
    loading: boolean;
    error: string | null;
    rows: SurveyQuestionAnswerRow[] | null;
    onCloseAction: () => void;
}) {
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={props.onCloseAction}/>
            <div
                className="relative z-[71] w-full max-w-4xl overflow-hidden rounded-2xl border border-rose-900/30 bg-neutral-950 shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-rose-900/20 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-50">Results • {props.title}</div>
                    <Button
                        type="button"
                        variant="outline"
                        className="border-rose-900/40 bg-black/20 text-slate-50 hover:bg-rose-900/25"
                        onClick={props.onCloseAction}
                    >
                        Close
                    </Button>
                </div>

                <div className="max-h-[70vh] overflow-auto p-4">
                    {props.loading ? <div className="text-sm text-slate-400">Lade Antworten...</div> : null}
                    {props.error ? <div className="text-sm text-rose-300">{props.error}</div> : null}

                    {!props.loading && props.rows && props.rows.length === 0 ? (
                        <div className="text-sm text-slate-400">No answers.</div>
                    ) : null}

                    {!props.loading && props.rows && props.rows.length > 0 ? (
                        <div className="overflow-auto rounded-xl border border-rose-900/20">
                            <table className="w-full border-collapse text-sm">
                                <thead className="bg-black/20 text-slate-200">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Label</th>
                                    <th className="px-3 py-2 text-left font-semibold">Access Code</th>
                                    <th className="px-3 py-2 text-left font-semibold">Submitted</th>
                                    <th className="px-3 py-2 text-left font-semibold">Answer</th>
                                </tr>
                                </thead>
                                <tbody>
                                {props.rows.map((r, idx) => (
                                    <tr key={idx} className="border-t border-rose-900/15">
                                        <td className="px-3 py-2 text-slate-50">{r.participantLabel ?? "—"}</td>
                                        <td className="px-3 py-2 text-slate-300">{r.accessCode}</td>
                                        <td className="px-3 py-2 text-slate-300">
                                            {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}
                                        </td>
                                        <td className="px-3 py-2 text-slate-200 whitespace-pre-wrap">
                                            {Array.isArray(r.value) ? JSON.stringify(r.value) : String(r.value)}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
