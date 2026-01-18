"use client";

// app/modules/management/surveys/components/SurveyDetailsPageClient.tsx
//
// Purpose:
// - Read-only: show Study, Tasks, Templates, Questions, Options.
// - No edit/delete.

import Link from "next/link";
import {useEffect, useState} from "react";
import {toast} from "sonner";
import {getStudy} from "../api";
import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Separator} from "@/components/ui/separator";

export default function SurveyDetailsPageClient({studyId}: { studyId: string }) {
    const [loading, setLoading] = useState(true);
    const [study, setStudy] = useState<any | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await getStudy(studyId);
            if (!res.ok) {
                toast.error(res.error ?? "Failed to load study");
                setStudy(null);
            } else {
                setStudy(res.study);
            }
            setLoading(false);
        })();
    }, [studyId]);

    if (loading) return <div className="text-slate-300 text-sm">Loading…</div>;
    if (!study) return <div className="text-slate-300 text-sm">Not found.</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{study.name}</h1>
                    <p className="text-slate-300 text-sm">{study.key}</p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Create exactly one participant from this Study (studyId is preselected via query). */}
                    <Button asChild>
                        <Link href={`/management/participants/new?studyId=${study.id}`}>+ Participant</Link>
                    </Button>

                    <Button asChild variant="secondary">
                        <Link href="/management/surveys">Back</Link>
                    </Button>
                </div>
            </div>

            <Card className="rounded-2xl border border-rose-900/30 bg-black/25">
                <CardContent className="p-5 space-y-3">
                    <div className="text-slate-50 font-medium">Study basics</div>
                    <div className="text-slate-300 text-sm">
                        {study.description || <span className="text-slate-400 italic">No description</span>}
                    </div>

                    <Separator/>

                    <div className="text-slate-50 font-medium">Tasks</div>
                    <div className="grid gap-3">
                        {study.tasks?.map((t: any) => (
                            <div key={t.id} className="rounded-xl border border-rose-900/20 bg-black/20 p-4">
                                <div className="text-slate-50 font-medium">
                                    Task {t.taskNumber}: {t.title}
                                </div>
                                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                  {t.promptMarkdown}
                </pre>
                            </div>
                        ))}
                    </div>

                    <Separator/>

                    <div className="text-slate-50 font-medium">Survey templates</div>
                    <div className="grid gap-4">
                        {study.surveyTemplates?.map((tpl: any) => (
                            <div key={tpl.id}
                                 className="rounded-xl border border-rose-900/20 bg-black/20 p-4 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-slate-50 font-medium">{tpl.name}</div>
                                    <div className="text-xs text-slate-400">{tpl.key}</div>
                                </div>
                                {tpl.description ? (
                                    <div className="text-slate-300 text-sm">{tpl.description}</div>
                                ) : (
                                    <div className="text-slate-400 text-sm italic">No description</div>
                                )}

                                <div className="pt-2 space-y-2">
                                    {tpl.questions?.map((q: any) => (
                                        <div key={q.id}
                                             className="rounded-lg border border-rose-900/15 bg-black/15 p-3">
                                            <div className="text-slate-50 text-sm font-medium">
                                                {q.order}. {q.key} — <span className="text-slate-300">{q.type}</span>
                                            </div>
                                            <div className="text-slate-300 text-sm">{q.text}</div>

                                            {q.type === "SCALE_NRS" ? (
                                                <div className="text-xs text-slate-400 mt-1">
                                                    Scale: {q.scaleMin}…{q.scaleMax} (step {q.scaleStep})
                                                </div>
                                            ) : null}

                                            {q.options?.length ? (
                                                <div className="text-xs text-slate-400 mt-2">
                                                    Options:{" "}
                                                    {q.options.map((o: any) => `${o.value}=${o.label}`).join(", ")}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
