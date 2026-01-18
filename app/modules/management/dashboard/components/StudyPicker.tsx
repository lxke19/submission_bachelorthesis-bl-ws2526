"use client";

// app/modules/management/dashboard/components/StudyPicker.tsx
//
// Purpose:
// - Searchable "dropdown" without relying on external UI libs.
// - Supports "All Studies" (null) and selecting exactly one Study.
// - Uses a simple popover panel with an input filter (search inside dropdown).
//
// Notes:
// - Next.js may enforce "serializable props" on Client Component boundaries.
//   Renaming callbacks to *Action prevents TS71007 warnings in many setups.

import React, {useMemo, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import type {StudyListItem} from "../types";

export default function StudyPicker(props: {
    studies: StudyListItem[];
    value: string | null;
    pendingValue: string | null;
    onChangePendingAction: (next: string | null) => void;
    onApplyAction: () => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return props.studies;
        return props.studies.filter((s) => {
            const hay = `${s.name} ${s.key}`.toLowerCase();
            return hay.includes(q);
        });
    }, [props.studies, query]);

    const currentLabel = useMemo(() => {
        if (!props.value) return "All Studies";
        const found = props.studies.find((s) => s.id === props.value);
        return found ? `${found.name} (${found.key})` : "Selected Study";
    }, [props.value, props.studies]);

    const pendingLabel = useMemo(() => {
        if (!props.pendingValue) return "All Studies";
        const found = props.studies.find((s) => s.id === props.pendingValue);
        return found ? `${found.name} (${found.key})` : "Selected Study";
    }, [props.pendingValue, props.studies]);

    return (
        <div className="relative">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                    type="button"
                    variant="outline"
                    disabled={props.disabled}
                    className="justify-between border-rose-900/40 bg-black/20 text-slate-50 hover:bg-rose-900/25 sm:w-[360px] w-full"
                    onClick={() => setOpen((v) => !v)}
                >
                    <span className="truncate">{currentLabel}</span>
                    <span className="ml-3 text-xs text-slate-300">Change</span>
                </Button>

                <Button
                    type="button"
                    disabled={props.disabled || props.pendingValue === props.value}
                    className="border border-rose-900/40 bg-black/20 text-slate-50 hover:bg-rose-900/25 sm:w-auto w-full"
                    onClick={() => {
                        setOpen(false);
                        props.onApplyAction();
                    }}
                >
                    Apply
                </Button>
            </div>

            {open ? (
                <div
                    className="absolute z-50 mt-2 w-full max-w-[560px] rounded-2xl border border-rose-900/30 bg-neutral-950/95 p-3 shadow-lg">
                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-200">Select Study</div>

                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search study name or key..."
                            className="border-rose-900/30 bg-black/30 text-slate-50 placeholder:text-slate-400"
                        />

                        <div className="max-h-[260px] overflow-auto rounded-xl border border-rose-900/20">
                            <button
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                    props.pendingValue === null
                                        ? "bg-rose-900/25 text-rose-100"
                                        : "text-slate-200 hover:bg-rose-900/10"
                                }`}
                                onClick={() => props.onChangePendingAction(null)}
                            >
                                All Studies
                            </button>

                            {filtered.length === 0 ? (
                                <div className="px-3 py-3 text-sm text-slate-400">No matches.</div>
                            ) : (
                                filtered.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                            props.pendingValue === s.id
                                                ? "bg-rose-900/25 text-rose-100"
                                                : "text-slate-200 hover:bg-rose-900/10"
                                        }`}
                                        onClick={() => props.onChangePendingAction(s.id)}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="truncate">{s.name}</span>
                                            <span className="shrink-0 text-xs text-slate-400">{s.key}</span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="text-xs text-slate-400">
                                Pending: <span className="text-slate-200">{pendingLabel}</span>
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                className="border-rose-900/40 bg-black/20 text-slate-50 hover:bg-rose-900/25"
                                onClick={() => setOpen(false)}
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
