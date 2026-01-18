"use client";

// app/modules/management/surveys/components/SurveyListPageClient.tsx
//
// Purpose:
// - Show existing Studies ("Surveys").
// - Provide "Create Survey" button that goes to wizard.
// - Read-only: no edit/delete (by your requirement).

import Link from "next/link";
import {useEffect, useState} from "react";
import {toast} from "sonner";
import {listStudies} from "../api";
import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

export default function SurveyListPageClient() {
    const [loading, setLoading] = useState(true);
    const [studies, setStudies] = useState<any[]>([]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await listStudies();
            if (!res.ok) {
                toast.error(res.error ?? "Failed to load studies");
                setStudies([]);
            } else {
                setStudies(res.studies ?? []);
            }
            setLoading(false);
        })();
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Surveys</h1>
                    <p className="text-slate-300 text-sm">
                        A “Survey” here is a full Study configuration (tasks + survey templates + questions). Read-only
                        after creation.
                    </p>
                </div>

                <Button asChild>
                    <Link href="/management/surveys/new">Create Survey</Link>
                </Button>
            </div>

            {loading ? (
                <div className="text-slate-300 text-sm">Loading…</div>
            ) : studies.length === 0 ? (
                <Card className="rounded-2xl border border-rose-900/30 bg-black/25">
                    <CardContent className="p-5 space-y-2">
                        <div className="text-slate-50 font-medium">No surveys yet</div>
                        <div className="text-slate-300 text-sm">
                            Create your first Study configuration via the wizard.
                        </div>
                        <Button asChild className="mt-2">
                            <Link href="/management/surveys/new">Create Survey</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {studies.map((s) => (
                        <Card
                            key={s.id}
                            className="rounded-2xl border border-rose-900/30 bg-black/25 hover:bg-black/35 transition"
                        >
                            <CardContent className="p-5 space-y-1">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-slate-50 font-medium">{s.name}</div>
                                    <div className="text-xs text-slate-400">{s.key}</div>
                                </div>

                                {s.description ? (
                                    <div className="text-slate-300 text-sm line-clamp-2">
                                        {s.description}
                                    </div>
                                ) : (
                                    <div className="text-slate-400 text-sm italic">
                                        No description
                                    </div>
                                )}

                                <div
                                    className="text-xs text-slate-400 pt-2 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap gap-3">
                                        <span>Tasks: {s._count?.tasks ?? 0}</span>
                                        <span>Templates: {s._count?.surveyTemplates ?? 0}</span>
                                        <span>Participants: {s._count?.participants ?? 0}</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {/* Primary action: open read-only Study details. */}
                                        <Button asChild variant="secondary" size="sm">
                                            <Link href={`/management/surveys/${s.id}`}>Details</Link>
                                        </Button>

                                        {/* Convenience: create a single participant with this study preselected. */}
                                        <Button asChild size="sm">
                                            <Link href={`/management/participants/new?studyId=${s.id}`}>+
                                                Participant</Link>
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
