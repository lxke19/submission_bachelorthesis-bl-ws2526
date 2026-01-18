"use client";

// app/modules/publicStudy/components/SurveyRenderer.tsx
//
// Purpose:
// - Generic survey UI for SINGLE_CHOICE, MULTI_CHOICE, SCALE_NRS, TEXT.
// - Works for pre, post-task, final (just different API endpoints).
//
// Why:
// - You want standardized survey data.
// - This renderer outputs a structured answer payload that maps cleanly to Prisma:
//   SurveyAnswer.numericValue / selectedOptionId / selectedOptions / textValue.

import React, {useMemo, useState} from "react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import type {SubmitSurveyAnswer, SurveyQuestion} from "@/app/modules/publicStudy/api";

type Props = {
    title: string;
    questions: SurveyQuestion[];
    submitting: boolean;
    onSubmitAction: (answers: SubmitSurveyAnswer[]) => void;
};

export default function SurveyRenderer(props: Props) {
    const [scaleAnswers, setScaleAnswers] = useState<Record<string, number | null>>({});
    const [singleAnswers, setSingleAnswers] = useState<Record<string, string | null>>({});
    const [multiAnswers, setMultiAnswers] = useState<Record<string, string[]>>({});
    const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);

    const ordered = useMemo(() => {
        return props.questions.slice().sort((a, b) => a.order - b.order);
    }, [props.questions]);

    function buildAnswers(): SubmitSurveyAnswer[] | null {
        const out: SubmitSurveyAnswer[] = [];

        for (const q of ordered) {
            if (q.type === "SCALE_NRS") {
                const v = scaleAnswers[q.id] ?? null;
                if (q.required && (v == null || Number.isNaN(v))) {
                    setError("Bitte alle Pflichtfragen beantworten.");
                    return null;
                }
                if (v != null) out.push({questionId: q.id, type: "SCALE_NRS", numericValue: v});
            }

            if (q.type === "SINGLE_CHOICE") {
                const sel = singleAnswers[q.id] ?? null;
                if (q.required && !sel) {
                    setError("Bitte alle Pflichtfragen beantworten.");
                    return null;
                }
                if (sel) out.push({questionId: q.id, type: "SINGLE_CHOICE", selectedOptionId: sel});
            }

            if (q.type === "MULTI_CHOICE") {
                const sels = multiAnswers[q.id] ?? [];
                if (q.required && sels.length === 0) {
                    setError("Bitte alle Pflichtfragen beantworten.");
                    return null;
                }
                if (sels.length > 0) out.push({questionId: q.id, type: "MULTI_CHOICE", selectedOptionIds: sels});
            }

            if (q.type === "TEXT") {
                const t = (textAnswers[q.id] ?? "").trim();
                if (q.required && !t) {
                    setError("Bitte alle Pflichtfragen beantworten.");
                    return null;
                }
                if (t) out.push({questionId: q.id, type: "TEXT", textValue: t});
            }
        }

        setError(null);
        return out;
    }

    return (
        <div className="py-6">
            <div className="space-y-6">
                <header className="space-y-2">
                    <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-50">
                        {props.title}
                    </h1>
                    <p className="text-slate-300">
                        Bitte beantworte die Fragen. Pflichtfragen sind markiert.
                    </p>
                </header>

                <div className="space-y-4">
                    {ordered.map((q) => {
                        return (
                            <section
                                key={q.id}
                                className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-3"
                            >
                                <div className="space-y-1">
                                    <p className="text-sm text-slate-400">{q.key}</p>
                                    <h2 className="text-base font-semibold text-slate-100">
                                        {q.text}{" "}
                                        {q.required ? <span className="text-rose-300">*</span> : null}
                                    </h2>
                                </div>

                                {q.type === "SCALE_NRS" ? (
                                    <div className="flex flex-wrap gap-2">
                                        {(() => {
                                            const min = q.scaleMin ?? 1;
                                            const max = q.scaleMax ?? 10;
                                            const step = q.scaleStep ?? 1;

                                            const items: number[] = [];
                                            for (let v = min; v <= max; v += step) items.push(v);

                                            const cur = scaleAnswers[q.id] ?? null;

                                            return items.map((v) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    className={`h-10 min-w-10 rounded-xl border px-3 text-sm font-semibold ${
                                                        cur === v
                                                            ? "border-rose-500 bg-rose-900/30 text-slate-50"
                                                            : "border-rose-900/30 bg-black/10 text-slate-200 hover:bg-rose-900/20"
                                                    }`}
                                                    onClick={() => setScaleAnswers((s) => ({...s, [q.id]: v}))}
                                                >
                                                    {v}
                                                </button>
                                            ));
                                        })()}
                                    </div>
                                ) : null}

                                {q.type === "SINGLE_CHOICE" ? (
                                    <div className="space-y-2">
                                        {q.options
                                            .slice()
                                            .sort((a, b) => a.order - b.order)
                                            .map((opt) => {
                                                const cur = singleAnswers[q.id] ?? null;
                                                return (
                                                    <label
                                                        key={opt.id}
                                                        className="flex items-center gap-3 rounded-xl border border-rose-900/30 bg-black/10 px-3 py-2 hover:bg-rose-900/20"
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={`q_${q.id}`}
                                                            checked={cur === opt.id}
                                                            onChange={() =>
                                                                setSingleAnswers((s) => ({...s, [q.id]: opt.id}))
                                                            }
                                                        />
                                                        <span className="text-sm text-slate-200">{opt.label}</span>
                                                        <span
                                                            className="ml-auto text-xs text-slate-400">{opt.value}</span>
                                                    </label>
                                                );
                                            })}
                                    </div>
                                ) : null}

                                {q.type === "MULTI_CHOICE" ? (
                                    <div className="space-y-2">
                                        {q.options
                                            .slice()
                                            .sort((a, b) => a.order - b.order)
                                            .map((opt) => {
                                                const cur = new Set(multiAnswers[q.id] ?? []);
                                                const checked = cur.has(opt.id);
                                                return (
                                                    <label
                                                        key={opt.id}
                                                        className="flex items-center gap-3 rounded-xl border border-rose-900/30 bg-black/10 px-3 py-2 hover:bg-rose-900/20"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => {
                                                                const next = new Set(multiAnswers[q.id] ?? []);
                                                                if (next.has(opt.id)) next.delete(opt.id);
                                                                else next.add(opt.id);
                                                                setMultiAnswers((s) => ({
                                                                    ...s,
                                                                    [q.id]: Array.from(next)
                                                                }));
                                                            }}
                                                        />
                                                        <span className="text-sm text-slate-200">{opt.label}</span>
                                                        <span
                                                            className="ml-auto text-xs text-slate-400">{opt.value}</span>
                                                    </label>
                                                );
                                            })}
                                    </div>
                                ) : null}

                                {q.type === "TEXT" ? (
                                    <Textarea
                                        value={textAnswers[q.id] ?? ""}
                                        onChange={(e) => setTextAnswers((s) => ({...s, [q.id]: e.target.value}))}
                                        placeholder="Antwort..."
                                    />
                                ) : null}
                            </section>
                        );
                    })}
                </div>

                {error ? (
                    <p className="text-sm text-rose-300">{error}</p>
                ) : (
                    <p className="text-xs text-slate-400">* Pflichtfrage</p>
                )}

                <Button
                    disabled={props.submitting}
                    className="w-full"
                    onClick={() => {
                        const answers = buildAnswers();
                        if (!answers) return;
                        props.onSubmitAction(answers);
                    }}
                >
                    {props.submitting ? "Sende..." : "Absenden"}
                </Button>
            </div>
        </div>
    );
}
