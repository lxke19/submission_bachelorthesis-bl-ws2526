// app/modules/management/dashboard/components/tabs/ExportsTab.tsx
"use client";

/**
 * ExportsTab (Management Dashboard)
 * --------------------------------
 * Purpose:
 * - Provide one-click CSV exports for analysis (e.g., pandas/R/Excel).
 * - Allow choosing a cohort filter that applies to ALL export datasets.
 *
 * Cohort semantics:
 * - all: exports all participants in the study.
 * - completed: exports only participants whose study flow is marked completed
 *   (status === COMPLETED OR currentStep === DONE).
 *
 * CSV safety:
 * - Exports are always generated as robust CSV (comma-delimited).
 * - Values are properly escaped/quoted so user inputs (commas, semicolons, newlines, quotes)
 *   cannot break the CSV structure.
 */

import React, {useMemo, useState} from "react";
import {Button} from "@/components/ui/button";

type Cohort = "all" | "completed";

export default function ExportsTab(props: { studyId: string; studyKey: string }) {
    const [cohort, setCohort] = useState<Cohort>("completed");

    const base = useMemo(() => `/api/management/study/${props.studyId}/export`, [props.studyId]);

    function href(dataset: string) {
        const qs = new URLSearchParams();
        qs.set("cohort", cohort);
        return `${base}/${dataset}?${qs.toString()}`;
    }

    // Shared button styling so the grid looks consistent and "clean".
    const btnClass =
        "w-full min-h-[44px] border border-rose-900/40 bg-black/20 text-slate-50 hover:bg-rose-900/25 whitespace-normal text-center leading-tight";

    return (
        <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-sm font-semibold text-slate-200">Exports</div>
                    <div className="text-xs text-slate-400">
                        Download analysis-ready CSVs (Variant 1 vs 2, Dropout/Outlier Flags inklusive).
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <select
                        className="rounded-lg border border-rose-900/25 bg-black/15 px-2 py-1 text-xs text-slate-200"
                        value={cohort}
                        onChange={(e) => setCohort(e.target.value as Cohort)}
                    >
                        <option value="all">Cohort: all</option>
                        <option value="completed">Cohort: completed</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <a href={href("participants_wide")} className="block">
                    <Button className={btnClass} type="button">
                        participants_wide.csv
                    </Button>
                </a>

                <a href={href("task_sessions")} className="block">
                    <Button className={btnClass} type="button">
                        task_sessions.csv
                    </Button>
                </a>

                <a href={href("survey_instances")} className="block">
                    <Button className={btnClass} type="button">
                        survey_instances.csv
                    </Button>
                </a>

                <a href={href("survey_answers_long")} className="block">
                    <Button className={btnClass} type="button">
                        survey_answers_long.csv
                    </Button>
                </a>

                <a href={href("access_logs")} className="block">
                    <Button className={btnClass} type="button">
                        access_logs.csv (optional)
                    </Button>
                </a>

                <a href={href("chat_turn_groups")} className="block">
                    <Button className={btnClass} type="button">
                        <span className="flex flex-col items-center justify-center gap-0.5">
                            <span className="text-sm font-medium">chat_turn_groups.csv</span>
                            <span className="text-[11px] text-slate-300">
                                USER → Timeliness → ASSISTANT
                            </span>
                        </span>
                    </Button>
                </a>
            </div>

            <div className="text-xs text-slate-400 space-y-1">
                <p>
                    <span className="font-semibold text-slate-200">completed</span> = nur Teilnehmende mit{" "}
                    <span className="font-semibold text-slate-200">COMPLETED</span> oder{" "}
                    <span className="font-semibold text-slate-200">DONE</span>.
                </p>
                <p>
                    CSVs werden immer <span className="font-semibold text-slate-200">sicher escaped</span>, damit
                    Nutzereingaben (Komma, Semikolon, Newlines, Quotes) die Datei nicht kaputt machen.
                </p>
                <p>
                    Outlier werden <span className="font-semibold text-slate-200">markiert</span> (z.B.
                    Chat &gt; 60min),
                    nicht automatisch entfernt.
                </p>
            </div>
        </div>
    );
}
