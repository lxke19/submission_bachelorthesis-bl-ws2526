"use client";

// app/(management)/management/(protected)/chat/page-client.tsx
//
// Purpose:
// - Render a standalone Thread UI in the management area to test the assistant.
// - Includes minimal controls to set:
//   - apiUrl (LangGraph API base URL)
//   - assistantId (graph_id or assistant_id; UUID treated as assistant_id)
//   - threadId (checkpoint key)
// - Uses the same Thread/Stream/Artifact providers as the study chat.
//
// Why:
// - Your ThreadProvider reads apiUrl + assistantId via nuqs query state.
// - LangGraph checkpointing keys off thread_id, so having a stable threadId is useful.
//
// UX:
// - If you already set apiUrl/assistantId/threadId via URL, the inputs show them.
// - Changing inputs updates the URL query params (nuqs) without manual editing.
// - Env defaults are applied automatically ONLY if query params are missing/empty.
// - ThreadID stays user-controlled/auto-filled by the system; we don't overwrite it.

import React, {useEffect, useMemo} from "react";
import {useQueryState} from "nuqs";

import {Thread} from "@/components/thread";
import {StreamProvider} from "@/providers/Stream";
import {ThreadProvider} from "@/providers/Thread";
import {ArtifactProvider} from "@/components/thread/artifact";

import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";

export default function ManagementChatPageClient(props: {
    defaultApiUrl: string;
    defaultAssistantId: string;
}) {
    const [apiUrl, setApiUrl] = useQueryState("apiUrl");
    const [assistantId, setAssistantId] = useQueryState("assistantId");
    const [threadId, setThreadId] = useQueryState("threadId");

    const defaults = useMemo(
        () => ({
            apiUrl: (props.defaultApiUrl ?? "").trim(),
            assistantId: (props.defaultAssistantId ?? "").trim(),
        }),
        [props.defaultApiUrl, props.defaultAssistantId],
    );

    useEffect(() => {
        const apiUrlMissing = apiUrl === null || apiUrl.trim() === "";
        const assistantIdMissing = assistantId === null || assistantId.trim() === "";

        if (apiUrlMissing && defaults.apiUrl) void setApiUrl(defaults.apiUrl);
        if (assistantIdMissing && defaults.assistantId) void setAssistantId(defaults.assistantId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaults.apiUrl, defaults.assistantId, apiUrl, assistantId]);

    function onReset() {
        void setApiUrl(null);
        void setAssistantId(null);
        void setThreadId(null);
    }

    return (
        <div className="h-full min-h-0 flex flex-col py-6 gap-4">
            <header className="shrink-0 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold text-slate-50">Management - Chat Playground</h1>
                        <p className="text-slate-300">
                            Teste den Assistant/Graph mit dem vollen Thread-UI (Tools, Interrupts, History, etc.).
                        </p>
                    </div>

                    <Button onClick={onReset} variant="secondary" className="sm:w-auto w-full">
                        Query zurücksetzen
                    </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="apiUrl" className="text-slate-200">apiUrl</Label>
                        <Input
                            id="apiUrl"
                            placeholder="http://localhost:2024"
                            value={apiUrl ?? ""}
                            onChange={(e) => setApiUrl(e.target.value || null)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="assistantId" className="text-slate-200">assistantId</Label>
                        <Input
                            id="assistantId"
                            placeholder="graph_id oder assistant_id"
                            value={assistantId ?? ""}
                            onChange={(e) => setAssistantId(e.target.value || null)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="threadId" className="text-slate-200">threadId</Label>
                        <Input
                            id="threadId"
                            placeholder="optional, z.B. test-thread-1"
                            value={threadId ?? ""}
                            onChange={(e) => setThreadId(e.target.value || null)}
                        />
                    </div>
                </div>
            </header>

            {/* Wissenschaftlicher Hinweis / Einschränkung */}
            <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
                <p className="font-semibold text-rose-300">Hinweis zur Funktionalität im Rahmen der Bachelorarbeit</p>
                <p className="mt-1">
                    Diese Verwaltungs-Chat-Ansicht zeigt bewusst zusätzliche UI-Optionen wie
                    <span className="font-medium"> „Hide Tool Calls“</span> sowie
                    <span className="font-medium"> „Upload PDF or Image“</span>, da diese vom
                    Agent-Chat-Framework technisch bereitgestellt werden.
                </p>
                <p className="mt-1">
                    Im eigentlichen Studiensystem sind Tool Calls Info-Panels jedoch deaktiviert, da sie
                    zusätzliche Informationen liefern können, die Teilnehmende verwirren oder die
                    Ergebnisse verfälschen würden. Die Nutzung würde zudem den inhaltlichen Rahmen
                    dieser Bachelorarbeit überschreiten.
                </p>
                <p className="mt-1">
                    Die Upload-Funktion für PDFs oder Bilder ist technisch funktionsfähig, wird jedoch
                    im öffentlichen Survey-Bereich bewusst ausgeblendet und ist ausschließlich hier im
                    Management-Chat sichtbar.
                </p>
            </div>

            {/* Chat area - now ~40% taller */}
            <section className="chat-light min-h-0 flex-1">
                <div
                    className="min-h-0 overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-sm"
                    style={{height: "calc(100dvh - 140px)", minHeight: 720}}
                >
                    <div className="h-full min-h-0 flex flex-col">
                        <ThreadProvider>
                            <StreamProvider>
                                <ArtifactProvider>
                                    <div className="h-full min-h-0">
                                        <Thread/>
                                    </div>
                                </ArtifactProvider>
                            </StreamProvider>
                        </ThreadProvider>
                    </div>
                </div>
            </section>
        </div>
    );
}
