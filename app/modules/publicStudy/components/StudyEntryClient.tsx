"use client";

// app/modules/publicStudy/components/StudyEntryClient.tsx
//
// Purpose:
// - Render the access code input.
// - On submit:
//   1) Call /api/study/session/start
//   2) Store token in StudySessionProvider (in-memory)
//   3) Redirect to /study/[code]/resume
//
// Note (UX):
// - On hard reload, the in-memory token is gone -> user returns here.
// - This is intentional and safe: with the same access code, users can continue
//   exactly where they left off (server decides current step via /resume).

import React, {useMemo, useState} from "react";
import {useRouter} from "next/navigation";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {startStudySession} from "@/app/modules/publicStudy/api";
import {useStudySession} from "@/app/modules/publicStudy/StudySessionProvider";

export default function StudyEntryClient() {
    const router = useRouter();
    const {setSession, clearSession} = useStudySession();

    const [accessCode, setAccessCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmed = useMemo(() => accessCode.trim(), [accessCode]);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        const code = trimmed;
        if (!code) {
            setError("Bitte Access-Code eingeben.");
            return;
        }

        setLoading(true);
        clearSession();

        const res = await startStudySession({
            accessCode: code,
            clientMeta: {
                locale: typeof navigator !== "undefined" ? navigator.language : undefined,
                viewport:
                    typeof window !== "undefined"
                        ? {w: window.innerWidth, h: window.innerHeight}
                        : undefined,
            },
        });

        setLoading(false);

        if (!res.ok) {
            setError(res.error ?? "Start fehlgeschlagen.");
            return;
        }

        // Store token in memory (reload wipes it intentionally).
        setSession({accessCode: res.accessCode, token: res.token});

        // Always route via resume (single strict flow decision point).
        router.push(`/study/${res.accessCode}/resume`);
    }

    return (
        <div className="py-10">
            <div className="mx-auto max-w-xl space-y-6">
                <header className="space-y-2">
                    <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-50">
                        Study Start
                    </h1>

                    <p className="text-slate-200">
                        Bitte gib deinen Access-Code ein, um zu starten oder fortzusetzen.
                    </p>

                    <div
                        className="rounded-2xl border border-slate-700/30 bg-black/20 p-4 text-sm text-slate-300 space-y-2">
                        <p>
                            <span className="font-semibold text-slate-200">Wichtig:</span> Wenn du die Seite neu lädst,
                            wirst du aus Sicherheitsgründen hierher zurückgeleitet (der Sitzungstoken wird nur temporär
                            gespeichert und geht beim Reload verloren).
                        </p>
                        <p>
                            <span className="font-semibold text-slate-200">Kein Risiko:</span> Du kannst jederzeit
                            einfach
                            denselben Access-Code erneut eingeben und{" "}
                            <span className="font-semibold text-slate-200">genau dort weitermachen</span>, wo du
                            aufgehört hast.
                        </p>
                    </div>
                </header>

                <form
                    onSubmit={onSubmit}
                    className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-4"
                >
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-200">Access-Code</label>
                        <Input
                            value={accessCode}
                            onChange={(e) => setAccessCode(e.target.value)}
                            placeholder="z.B. 4f0b2b7a-..."
                            autoComplete="off"
                            spellCheck={false}
                        />

                        {error ? (
                            <p className="text-sm text-rose-300">{error}</p>
                        ) : (
                            <p className="text-xs text-slate-400">
                                Hinweis: Direkter Zugriff auf Study-Seiten ohne gültige Sitzung ist deaktiviert.
                            </p>
                        )}
                    </div>

                    <Button type="submit" disabled={loading} className="w-full">
                        {loading ? "Starte..." : "Starten / Fortsetzen"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
