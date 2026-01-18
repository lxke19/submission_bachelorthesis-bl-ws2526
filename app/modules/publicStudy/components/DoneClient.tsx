"use client";

// app/modules/publicStudy/components/DoneClient.tsx
//
// Purpose:
// - Show completion message.
// - Still requires a valid in-memory session token (so reload kicks out as you want).
//
// Why:
// - Keeps done page consistent with your "no direct navigation" rule.
//
// Additional behavior (timing correctness):
// - Send periodic heartbeats while the done page is open.
// - This ensures the participant.lastActiveAt reflects actual end-of-study presence.

import React, {useEffect} from "react";
import {useRouter} from "next/navigation";
import {useRequireStudySession} from "@/app/modules/publicStudy/hooks";
import {Button} from "@/components/ui/button";

export default function DoneClient({accessCode}: { accessCode: string }) {
    const router = useRouter();
    const session = useRequireStudySession(accessCode);
    if (!session) return null;

    // Heartbeat while done page is mounted (best-effort).
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

    return (
        <div className="py-10 space-y-3">
            <h1 className="text-2xl font-semibold text-slate-50">Done</h1>
            <p className="text-slate-300">
                Vielen Dank! Du hast die Studie abgeschlossen.
            </p>
            <p className="text-xs text-slate-400">
                Hinweis: Nach einem Reload musst du den Access-Code erneut eingeben (gewollt).
            </p>

            {/* Requested: Button back to /study (App Router) */}
            <div className="pt-2">
                <Button
                    type="button"
                    variant="outline"
                    className="border-slate-600/60 bg-transparent text-slate-200 hover:bg-white/5"
                    onClick={() => router.push("/study")}
                >
                    Zurück zu /study
                </Button>
            </div>
        </div>
    );
}
