"use client";

// app/modules/publicStudy/components/ResumeClient.tsx
//
// Purpose:
// - Call /api/study/resume to get the correct next page (based on participant.currentStep).
// - Then router.replace(...) to enforce flow.
//
// Why:
// - Central, strict routing decision.
// - If a user tries to open a wrong page, each page will also enforce step,
//   but resume is the canonical "where should I be right now?".
//
// Additional behavior (timing correctness):
// - Send a heartbeat while the resume screen is active.
// - This avoids "inactive gaps" if the user lingers on resume due to slow navigation.

import React, {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {useRequireStudySession} from "@/app/modules/publicStudy/hooks";
import {resumeStudy} from "@/app/modules/publicStudy/api";

export default function ResumeClient({accessCode}: { accessCode: string }) {
    const router = useRouter();
    const session = useRequireStudySession(accessCode);
    const [error, setError] = useState<string | null>(null);

    // Heartbeat while mounted (resume is short-lived, but cheap).
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
            const res = await resumeStudy(session.token);
            if (!res.ok) {
                // What: token invalid or participant not allowed.
                // Why: send back to /study to re-enter code.
                router.replace("/study");
                return;
            }
            router.replace(res.redirectTo);
        })().catch((e) => setError(e instanceof Error ? e.message : "Resume failed"));
    }, [session, router]);

    return (
        <div className="py-10 space-y-3">
            <h1 className="text-2xl font-semibold text-slate-50">Resume</h1>
            <p className="text-slate-300">Leite weiter...</p>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        </div>
    );
}
