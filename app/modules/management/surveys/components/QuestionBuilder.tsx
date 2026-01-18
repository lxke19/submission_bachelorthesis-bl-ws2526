"use client";

// app/modules/management/surveys/components/QuestionBuilder.tsx
//
// Purpose:
// - Edit questions per template.
// - Add/remove questions.
// - Reorder questions (up/down).
// - Edit scale config and choice options.
// - Keeps everything export-friendly (stable keys + orders).
//
// Your requirement:
// - Scales: include one Likert and one 1..10 (already in defaults)
// - Allow adding more via "+" button.

import {useMemo, useState} from "react";
import type {SurveyTemplatePayload, SurveyQuestionPayload, SurveyQuestionType} from "../types";

import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";

const QUESTION_TYPES: { value: SurveyQuestionType; label: string }[] = [
    {value: "SINGLE_CHOICE", label: "Single choice"},
    {value: "MULTI_CHOICE", label: "Multi choice"},
    {value: "SCALE_NRS", label: "Scale (numeric rating)"},
    {value: "TEXT", label: "Text"},
];

function nextOrder(questions: SurveyQuestionPayload[]) {
    const max = questions.reduce((m, q) => Math.max(m, q.order), 0);
    return max + 10;
}

function normalizeOrders(questions: SurveyQuestionPayload[]) {
    // Keep order stable but ensure strictly increasing.
    const sorted = questions.slice().sort((a, b) => a.order - b.order);
    return sorted.map((q, idx) => ({...q, order: (idx + 1) * 10}));
}

function newQuestion(templateKey: string, order: number): SurveyQuestionPayload {
    return {
        key: `${templateKey}_q_${order}`,
        text: "New question",
        type: "SCALE_NRS",
        required: true,
        order,
        scaleMin: 1,
        scaleMax: 10,
        scaleStep: 1,
    };
}

export default function QuestionBuilder({
                                            templates,
                                            onChange,
                                        }: {
    templates: SurveyTemplatePayload[];
    onChange: (templates: SurveyTemplatePayload[]) => void;
}) {
    const [activeKey, setActiveKey] = useState<SurveyTemplatePayload["key"]>(templates[0]?.key ?? "pre");
    const activeIndex = useMemo(
        () => templates.findIndex((t) => t.key === activeKey),
        [templates, activeKey],
    );
    const active = templates[activeIndex];

    function updateActive(nextTpl: SurveyTemplatePayload) {
        const next = templates.slice();
        next[activeIndex] = nextTpl;
        onChange(next);
    }

    if (!active) {
        return (
            <div className="text-slate-300 text-sm">
                No templates found.
            </div>
        );
    }

    return (
        <Card className="rounded-2xl border border-rose-900/30 bg-black/25">
            <CardContent className="p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-slate-50 font-medium">Questions</div>
                        <div className="text-slate-300 text-sm">
                            Edit questions per template. Add as many as you need.
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {templates.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => setActiveKey(t.key)}
                                className={[
                                    "px-3 py-1.5 rounded-xl text-sm border transition",
                                    t.key === activeKey
                                        ? "border-rose-500/50 bg-rose-900/20 text-slate-50"
                                        : "border-rose-900/20 bg-black/10 text-slate-300 hover:bg-black/20",
                                ].join(" ")}
                            >
                                {t.key}
                            </button>
                        ))}
                    </div>
                </div>

                <Separator/>

                <div className="flex items-center justify-between gap-3">
                    <div className="text-slate-50 font-medium">{active.name}</div>
                    <Button
                        onClick={() => {
                            const order = nextOrder(active.questions);
                            const q = newQuestion(active.key, order);
                            updateActive({...active, questions: normalizeOrders([...active.questions, q])});
                        }}
                    >
                        + Add question
                    </Button>
                </div>

                <div className="grid gap-4">
                    {active.questions
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((q, idx, arr) => (
                            <QuestionCard
                                key={q.key}
                                templateKey={active.key}
                                question={q}
                                canMoveUp={idx > 0}
                                canMoveDown={idx < arr.length - 1}
                                onChange={(nextQ) => {
                                    const questions = active.questions.map((x) => (x.key === q.key ? nextQ : x));
                                    updateActive({...active, questions});
                                }}
                                onDelete={() => {
                                    const questions = active.questions.filter((x) => x.key !== q.key);
                                    updateActive({...active, questions: normalizeOrders(questions)});
                                }}
                                onMove={(dir) => {
                                    const sorted = active.questions.slice().sort((a, b) => a.order - b.order);
                                    const i = sorted.findIndex((x) => x.key === q.key);
                                    const j = dir === "up" ? i - 1 : i + 1;
                                    if (j < 0 || j >= sorted.length) return;
                                    const tmp = sorted[i];
                                    sorted[i] = sorted[j];
                                    sorted[j] = tmp;
                                    updateActive({...active, questions: normalizeOrders(sorted)});
                                }}
                            />
                        ))}
                </div>
            </CardContent>
        </Card>
    );
}

function QuestionCard({
                          templateKey,
                          question,
                          canMoveUp,
                          canMoveDown,
                          onChange,
                          onDelete,
                          onMove,
                      }: {
    templateKey: string;
    question: SurveyQuestionPayload;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onChange: (q: SurveyQuestionPayload) => void;
    onDelete: () => void;
    onMove: (dir: "up" | "down") => void;
}) {
    const q = question;

    return (
        <div className="rounded-xl border border-rose-900/20 bg-black/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="text-slate-50 font-medium">
                    {q.order}. {q.key}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" disabled={!canMoveUp} onClick={() => onMove("up")}>
                        ↑
                    </Button>
                    <Button variant="secondary" disabled={!canMoveDown} onClick={() => onMove("down")}>
                        ↓
                    </Button>
                    <Button variant="secondary" onClick={onDelete}>
                        Delete
                    </Button>
                </div>
            </div>

            <div className="grid gap-2">
                <Label>Key (analysis key)</Label>
                <Input
                    value={q.key}
                    onChange={(e) => onChange({...q, key: e.target.value.trim() || `${templateKey}_q`})}
                />
                <div className="text-xs text-slate-400">
                    Stable export key. Avoid changing after you start collecting data.
                </div>
            </div>

            <div className="grid gap-2">
                <Label>Question text</Label>
                <Textarea value={q.text} onChange={(e) => onChange({...q, text: e.target.value})}/>
            </div>

            <div className="grid gap-2">
                <Label>Type</Label>
                <select
                    className="rounded-xl border border-rose-900/20 bg-black/10 px-3 py-2 text-slate-200"
                    value={q.type}
                    onChange={(e) => {
                        const type = e.target.value as SurveyQuestionType;

                        // If switching to choice, ensure options exist.
                        if (type === "SINGLE_CHOICE" || type === "MULTI_CHOICE") {
                            const opts =
                                q.options && q.options.length >= 2
                                    ? q.options
                                    : [
                                        {value: "A", label: "Option A", order: 1},
                                        {value: "B", label: "Option B", order: 2},
                                    ];
                            onChange({
                                ...q,
                                type,
                                options: opts,
                                scaleMin: undefined,
                                scaleMax: undefined,
                                scaleStep: undefined
                            });
                            return;
                        }

                        // If switching to scale, ensure scale config exists.
                        if (type === "SCALE_NRS") {
                            onChange({...q, type, scaleMin: 1, scaleMax: 10, scaleStep: 1, options: undefined});
                            return;
                        }

                        // TEXT: clear scale/options.
                        onChange({
                            ...q,
                            type,
                            options: undefined,
                            scaleMin: undefined,
                            scaleMax: undefined,
                            scaleStep: undefined
                        });
                    }}
                >
                    {QUESTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </div>

            {q.type === "SCALE_NRS" ? (
                <div className="grid grid-cols-3 gap-3">
                    <div className="grid gap-1">
                        <Label>Min</Label>
                        <Input
                            type="number"
                            value={q.scaleMin ?? 1}
                            onChange={(e) => onChange({...q, scaleMin: Number(e.target.value)})}
                        />
                    </div>
                    <div className="grid gap-1">
                        <Label>Max</Label>
                        <Input
                            type="number"
                            value={q.scaleMax ?? 10}
                            onChange={(e) => onChange({...q, scaleMax: Number(e.target.value)})}
                        />
                    </div>
                    <div className="grid gap-1">
                        <Label>Step</Label>
                        <Input
                            type="number"
                            value={q.scaleStep ?? 1}
                            onChange={(e) => onChange({...q, scaleStep: Number(e.target.value)})}
                        />
                    </div>
                    <div className="col-span-3 text-xs text-slate-400">
                        Tip: Likert is usually 1-7. NRS is often 1-10.
                    </div>
                </div>
            ) : null}

            {(q.type === "SINGLE_CHOICE" || q.type === "MULTI_CHOICE") ? (
                <ChoiceOptionsEditor question={q} onChange={onChange}/>
            ) : null}
        </div>
    );
}

function ChoiceOptionsEditor({
                                 question,
                                 onChange,
                             }: {
    question: SurveyQuestionPayload;
    onChange: (q: SurveyQuestionPayload) => void;
}) {
    const opts = question.options ?? [];

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div className="text-slate-50 text-sm font-medium">Options</div>
                <Button
                    variant="secondary"
                    onClick={() => {
                        const nextOrder = (opts[opts.length - 1]?.order ?? 0) + 1;
                        const next = [...opts, {
                            value: String(nextOrder),
                            label: `Choice ${nextOrder}`,
                            order: nextOrder
                        }];
                        onChange({...question, options: next});
                    }}
                >
                    + Add option
                </Button>
            </div>

            {opts.length === 0 ? (
                <div className="text-xs text-slate-400">No options yet.</div>
            ) : (
                <div className="grid gap-2">
                    {opts
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((o, i) => (
                            <div
                                key={`${o.value}-${o.order}-${i}`}
                                className="grid grid-cols-12 gap-2 items-center"
                            >
                                <div className="col-span-3">
                                    <Input
                                        value={o.value}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            const next = opts.map((x) => (x.order === o.order ? {...x, value} : x));
                                            onChange({...question, options: next});
                                        }}
                                        placeholder="value"
                                    />
                                </div>
                                <div className="col-span-8">
                                    <Input
                                        value={o.label}
                                        onChange={(e) => {
                                            const label = e.target.value;
                                            const next = opts.map((x) => (x.order === o.order ? {...x, label} : x));
                                            onChange({...question, options: next});
                                        }}
                                        placeholder="label"
                                    />
                                </div>
                                <div className="col-span-1 flex justify-end">
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            const next = opts.filter((x) => x.order !== o.order);
                                            onChange({...question, options: next});
                                        }}
                                    >
                                        ✕
                                    </Button>
                                </div>
                            </div>
                        ))}
                </div>
            )}

            <div className="text-xs text-slate-400">
                Export tip: keep <span className="text-slate-200">value</span> stable and machine-friendly.
            </div>
        </div>
    );
}
