"use client";

// app/modules/publicStudy/components/FinalSurveyClient.tsx
//
// Purpose:
// - Load FINAL survey via /api/study/final
// - Submit via /api/study/final/submit
//
// Why:
// - Same standardized flow as PRE, just different phase and participant updates.
//
// Additional behavior (timing correctness):
// - Send periodic heartbeats while the final survey page is open.
// - This keeps participant.lastActiveAt accurate for dropout/inactivity capping.

import React, {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {useRequireStudySession} from "@/app/modules/publicStudy/hooks";
import {loadSurvey, submitSurvey, type SubmitSurveyAnswer} from "@/app/modules/publicStudy/api";
import SurveyRenderer from "@/app/modules/publicStudy/components/SurveyRenderer";
import ConfirmModal from "@/app/modules/publicStudy/components/ConfirmModal";

export default function FinalSurveyClient({accessCode}: { accessCode: string }) {
    const router = useRouter();
    const session = useRequireStudySession(accessCode);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [title, setTitle] = useState("Final Survey");
    const [questions, setQuestions] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Confirmation modal state (mandatory decision before real submit).
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingAnswers, setPendingAnswers] = useState<SubmitSurveyAnswer[] | null>(null);

    // Heartbeat loop while final survey page is mounted.
    useEffect(() => {
        if (!session) return;

        const ping = async () => {
            try {
                await fetch("/api/study/heartbeat", {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${session.token}`,
                    },
                });
            } catch {
                // best-effort
            }
        };

        void ping();
        const id = window.setInterval(() => void ping(), 30_000);

        return () => {
            window.clearInterval(id);
            void ping();
        };
    }, [session]);

    useEffect(() => {
        if (!session) return;

        (async () => {
            setLoading(true);
            const res = await loadSurvey(session.token, "/api/study/final");
            setLoading(false);

            if (!res.ok) {
                if (res.redirectTo) router.replace(res.redirectTo);
                else router.replace("/study");
                return;
            }

            setTitle(res.title);
            setQuestions(res.questions);
        })().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    }, [session, router]);

    // The actual submit (only executed after user confirms in the modal).
    async function submitConfirmed(answers: SubmitSurveyAnswer[]) {
        if (!session) return;

        setSubmitting(true);
        const res = await submitSurvey(session.token, "/api/study/final/submit", {answers});
        setSubmitting(false);

        if (!res.ok) {
            if (res.redirectTo) router.replace(res.redirectTo);
            else setError(res.error);
            return;
        }

        router.replace(res.redirectTo);
    }

    // Called by SurveyRenderer ONLY AFTER it considers validation successful.
    async function onSubmit(answers: SubmitSurveyAnswer[]) {
        if (!session) return;

        setPendingAnswers(answers);
        setConfirmOpen(true);
    }

    if (!session) return null;

    if (loading) {
        return (
            <div className="py-10 space-y-2">
                <h1 className="text-2xl font-semibold text-slate-50">Final Survey</h1>
                <p className="text-slate-300">Lade...</p>
                {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            </div>
        );
    }

    return (
        <>
            <ConfirmModal
                open={confirmOpen}
                title="Bestätigen"
                description="Möchtest du die Umfrage jetzt absenden? Du kannst deine Antworten danach nicht mehr ändern."
                confirmLabel="Ja, absenden"
                cancelLabel="Nein"
                confirmLoading={submitting}
                onCancelAction={() => {
                    setConfirmOpen(false);
                    setPendingAnswers(null);
                }}
                onConfirmAction={() => {
                    if (!pendingAnswers) return;
                    setConfirmOpen(false);
                    void submitConfirmed(pendingAnswers);
                    setPendingAnswers(null);
                }}
            />

            <SurveyRenderer
                title={title}
                questions={questions as any}
                submitting={submitting}
                onSubmitAction={onSubmit}
            />
        </>
    );
}
