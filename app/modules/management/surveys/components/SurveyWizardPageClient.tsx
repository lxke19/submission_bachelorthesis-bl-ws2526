"use client";

// app/modules/management/surveys/components/SurveyWizardPageClient.tsx
//
// Purpose:
// - Step wizard to build a full Study config.
// - Back/Next navigation.
// - Final step validates everything and POSTs in one shot.
// - Preconfigured defaults included (tasks + templates + questions).
//
// Steps:
// 1) Basics (Study)
// 2) Tasks (3 required)
// 3) Templates (fixed keys)
// 4) Question Builder (per template; add/remove/reorder; edit options/scale)
// 5) Review + Submit

import {useMemo, useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";

import {createDefaultStudyWizardState} from "../defaults";
import {createStudy} from "../api";
import {CreateStudyPayloadSchema} from "../validation";
import type {CreateStudyPayload} from "../types";

import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";

import QuestionBuilder from "./QuestionBuilder";

const STEPS = ["Basics", "Tasks", "Templates", "Questions", "Review"] as const;

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export default function SurveyWizardPageClient() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [state, setState] = useState<CreateStudyPayload>(() => createDefaultStudyWizardState());
    const [submitting, setSubmitting] = useState(false);

    const validation = useMemo(() => CreateStudyPayloadSchema.safeParse(state), [state]);

    function next() {
        setStep((s) => clamp(s + 1, 0, STEPS.length - 1));
    }

    function back() {
        setStep((s) => clamp(s - 1, 0, STEPS.length - 1));
    }

    async function submit() {
        const parsed = CreateStudyPayloadSchema.safeParse(state);
        if (!parsed.success) {
            toast.error("Please fix validation errors before submitting.");
            setStep(STEPS.indexOf("Review"));
            return;
        }

        setSubmitting(true);
        const res = await createStudy(parsed.data);
        setSubmitting(false);

        if (!res.ok) {
            toast.error(res.error ?? "Create failed");
            return;
        }

        toast.success("Survey created");
        router.push(`/management/surveys/${res.study.id}`);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Create Survey</h1>
                    <p className="text-slate-300 text-sm">
                        Wizard builds one Study configuration (3 tasks + 5 templates + questions). Submit creates
                        everything in one transaction.
                    </p>
                </div>
            </div>

            {/* Stepper */}
            <Card className="rounded-2xl border border-rose-900/30 bg-black/25">
                <CardContent className="p-4 flex flex-wrap gap-2">
                    {STEPS.map((label, idx) => {
                        const active = idx === step;
                        return (
                            <button
                                key={label}
                                onClick={() => setStep(idx)}
                                className={[
                                    "px-3 py-1.5 rounded-xl text-sm border transition",
                                    active
                                        ? "border-rose-500/50 bg-rose-900/20 text-slate-50"
                                        : "border-rose-900/20 bg-black/10 text-slate-300 hover:bg-black/20",
                                ].join(" ")}
                            >
                                {idx + 1}. {label}
                            </button>
                        );
                    })}
                </CardContent>
            </Card>

            {/* Step content */}
            {step === 0 ? (
                <Card className="rounded-2xl border border-rose-900/30 bg-black/25">
                    <CardContent className="p-5 space-y-4">
                        <div className="text-slate-50 font-medium">Study basics</div>

                        <div className="grid gap-2">
                            <Label>Study key (unique)</Label>
                            <Input
                                value={state.study.key}
                                onChange={(e) =>
                                    setState((s) => ({...s, study: {...s.study, key: e.target.value}}))
                                }
                                placeholder="ws2526-main"
                            />
                            <div className="text-xs text-slate-400">
                                Used for deterministic lookup & exports. Keep it stable.
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label>Study name</Label>
                            <Input
                                value={state.study.name}
                                onChange={(e) =>
                                    setState((s) => ({...s, study: {...s.study, name: e.target.value}}))
                                }
                                placeholder="Bachelor Thesis Study"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label>Description</Label>
                            <Textarea
                                value={state.study.description ?? ""}
                                onChange={(e) =>
                                    setState((s) => ({...s, study: {...s.study, description: e.target.value}}))
                                }
                                placeholder="Optional"
                            />
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {step === 1 ? (
                <Card className="rounded-2xl border border-rose-900/30 bg-black/25">
                    <CardContent className="p-5 space-y-4">
                        <div className="text-slate-50 font-medium">Tasks (exactly 3)</div>
                        <div className="text-slate-300 text-sm">
                            Task numbers are fixed (1..3). Edit titles/prompts as needed.
                        </div>

                        <div className="grid gap-4">
                            {state.tasks
                                .slice()
                                .sort((a, b) => a.taskNumber - b.taskNumber)
                                .map((t, idx) => (
                                    <div
                                        key={t.taskNumber}
                                        className="rounded-xl border border-rose-900/20 bg-black/20 p-4 space-y-3"
                                    >
                                        <div className="text-slate-50 font-medium">Task {t.taskNumber}</div>

                                        <div className="grid gap-2">
                                            <Label>Title</Label>
                                            <Input
                                                value={t.title}
                                                onChange={(e) => {
                                                    const title = e.target.value;
                                                    setState((s) => {
                                                        const tasks = s.tasks.slice();
                                                        tasks[idx] = {...tasks[idx], title};
                                                        return {...s, tasks};
                                                    });
                                                }}
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <Label>Prompt (Markdown)</Label>
                                            <Textarea
                                                className="min-h-[180px]"
                                                value={t.promptMarkdown}
                                                onChange={(e) => {
                                                    const promptMarkdown = e.target.value;
                                                    setState((s) => {
                                                        const tasks = s.tasks.slice();
                                                        tasks[idx] = {...tasks[idx], promptMarkdown};
                                                        return {...s, tasks};
                                                    });
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {step === 2 ? (
                <Card className="rounded-2xl border border-rose-900/30 bg-black/25">
                    <CardContent className="p-5 space-y-4">
                        <div className="text-slate-50 font-medium">Survey templates (fixed)</div>
                        <div className="text-slate-300 text-sm">
                            Keys are fixed to match your flow: pre, task1_post, task2_post, task3_post, final.
                        </div>

                        <div className="grid gap-4">
                            {state.templates.map((tpl, idx) => (
                                <div
                                    key={tpl.key}
                                    className="rounded-xl border border-rose-900/20 bg-black/20 p-4 space-y-3"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-slate-50 font-medium">{tpl.key}</div>
                                        <div className="text-xs text-slate-400">
                                            Questions: {tpl.questions.length}
                                        </div>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>Name</Label>
                                        <Input
                                            value={tpl.name}
                                            onChange={(e) => {
                                                const name = e.target.value;
                                                setState((s) => {
                                                    const templates = s.templates.slice();
                                                    templates[idx] = {...templates[idx], name};
                                                    return {...s, templates};
                                                });
                                            }}
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>Description</Label>
                                        <Textarea
                                            value={tpl.description ?? ""}
                                            onChange={(e) => {
                                                const description = e.target.value;
                                                setState((s) => {
                                                    const templates = s.templates.slice();
                                                    templates[idx] = {...templates[idx], description};
                                                    return {...s, templates};
                                                });
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {step === 3 ? (
                <QuestionBuilder
                    templates={state.templates}
                    onChange={(templates) => setState((s) => ({...s, templates}))}
                />
            ) : null}

            {step === 4 ? (
                <Card className="rounded-2xl border border-rose-900/30 bg-black/25">
                    <CardContent className="p-5 space-y-4">
                        <div className="text-slate-50 font-medium">Review</div>
                        <div className="text-slate-300 text-sm">
                            This runs the same validation as the server. Submit will create everything in one
                            transaction.
                        </div>

                        <div className="rounded-xl border border-rose-900/20 bg-black/20 p-4 space-y-2">
                            <div className="text-slate-50 text-sm font-medium">Summary</div>
                            <div className="text-xs text-slate-400">
                                Study: <span className="text-slate-200">{state.study.key}</span> —{" "}
                                <span className="text-slate-200">{state.study.name}</span>
                            </div>
                            <div className="text-xs text-slate-400">
                                Tasks: <span className="text-slate-200">{state.tasks.length}</span>, Templates:{" "}
                                <span className="text-slate-200">{state.templates.length}</span>
                            </div>
                        </div>

                        <Separator/>

                        {!validation.success ? (
                            <div className="rounded-xl border border-rose-500/30 bg-rose-950/15 p-4">
                                <div className="text-slate-50 font-medium text-sm">
                                    Validation errors
                                </div>
                                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                  {JSON.stringify(validation.error.flatten(), null, 2)}
                </pre>
                            </div>
                        ) : (
                            <div
                                className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 text-sm text-slate-200">
                                ✅ Valid payload. Ready to create.
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2">
                            <Button
                                disabled={submitting || !validation.success}
                                onClick={submit}
                            >
                                {submitting ? "Creating…" : "Create Survey"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {/* Footer nav */}
            <div className="flex items-center justify-between gap-3">
                <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}>
                    Back
                </Button>
                <Button
                    onClick={next}
                    disabled={step === STEPS.length - 1 || submitting}
                >
                    Next
                </Button>
            </div>
        </div>
    );
}
