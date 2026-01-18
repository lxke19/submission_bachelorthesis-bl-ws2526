"use client";

// app/modules/publicStudy/components/TaskChatFlowClient.tsx
//
// Purpose:
// - Enforce study session presence (no token => back to /study).
// - Load task prompt + langGraphThreadId from /api/study/task/:n
// - Set the URL query param `threadId` so LangGraph checkpointing uses this id.
// - Render task prompt (mobile-friendly) + chat area.
// - Provide "Ready to answer" button => /api/study/task/:n/ready => redirect to post survey.
//
// Why each thing is stored/used:
// - task prompt comes from DB TaskDefinition.promptMarkdown => reproducibility.
// - langGraphThreadId comes from ChatThread.langGraphThreadId => stable checkpoint key.
// - readyToAnswer timestamp is stored in TaskSession => later duration analytics.
//
// Additional behavior (timing correctness):
// - While the chat page is open, we send periodic heartbeats to the backend.
// - This keeps participant.lastActiveAt accurate even when the user is only reading.
// - When the user disappears (tab closed), heartbeats stop and the backend can cap durations.

import React, {useEffect, useMemo, useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {Button} from "@/components/ui/button";
import {loadTask, markReadyToAnswer} from "@/app/modules/publicStudy/api";
import {useRequireStudySession} from "@/app/modules/publicStudy/hooks";
import {MarkdownText} from "@/components/thread/markdown-text";
import {ChevronDown, X} from "lucide-react";
import ConfirmModal from "@/app/modules/publicStudy/components/ConfirmModal";

export default function TaskChatFlowClient(props: {
    accessCode: string;
    taskNumber: string;
    // children is the actual chat UI (Thread providers + <Thread/>)
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const session = useRequireStudySession(props.accessCode);

    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState(`Task ${props.taskNumber}`);
    const [promptMarkdown, setPromptMarkdown] = useState<string>("");
    const [threadId, setThreadId] = useState<string>("");
    const [sidePanelEnabled, setSidePanelEnabled] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [readyLoading, setReadyLoading] = useState(false);

    // Confirmation modal for "Ready to answer" (mandatory decision).
    const [readyConfirmOpen, setReadyConfirmOpen] = useState(false);

    // Task description UI state:
    // - Default expanded (so participants see it immediately).
    // - When expanded, show a bottom button to collapse without scrolling back up.
    const [taskOpen, setTaskOpen] = useState(true);

    /**
     * UI Helper Popups (Participant guidance)
     * ---------------------------------------
     * Requested behavior:
     * - "Ready to answer" should show a prominent, dark-red tooltip-like popup.
     * - It must be closable (X).
     * - If the user closes it, it should be gone for THIS TASK (per taskNumber).
     *
     * Implementation:
     * - sessionStorage key scoped by accessCode + taskNumber (best-effort, per-tab-session is enough for study UX).
     */
    const readyHintKey = useMemo(
        () => `ws2526_hint_ready_to_answer__${props.accessCode}__task_${props.taskNumber}`,
        [props.accessCode, props.taskNumber],
    );

    const [readyHintOpen, setReadyHintOpen] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        try {
            const dismissed = window.sessionStorage.getItem(readyHintKey) === "1";
            setReadyHintOpen(!dismissed);
        } catch {
            // If sessionStorage is blocked, just don't show the hint.
            setReadyHintOpen(false);
        }
    }, [readyHintKey]);

    function dismissReadyHint() {
        try {
            window.sessionStorage.setItem(readyHintKey, "1");
        } catch {
            // ignore storage failures
        }
        setReadyHintOpen(false);
    }

    const currentThreadIdParam = useMemo(() => searchParams.get("threadId") ?? "", [searchParams]);

    useEffect(() => {
        if (!session) return;

        (async () => {
            setLoading(true);
            const res = await loadTask(session.token, props.taskNumber);
            setLoading(false);

            if (!res.ok) {
                if (res.redirectTo) router.replace(res.redirectTo);
                else router.replace("/study");
                return;
            }

            setTitle(`${res.title}`);
            setPromptMarkdown(res.promptMarkdown);
            setThreadId(res.langGraphThreadId);
            setSidePanelEnabled(res.sidePanelEnabled);
        })().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    }, [session, router, props.taskNumber]);

    // Heartbeat loop while chat page is mounted.
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
                // best-effort: don't show errors to participants
            }
        };

        // Send one immediately, then every 30s.
        void ping();
        const id = window.setInterval(() => void ping(), 30_000);

        return () => {
            window.clearInterval(id);
            // final best-effort ping
            void ping();
        };
    }, [session]);

    useEffect(() => {
        if (!threadId) return;
        if (currentThreadIdParam === threadId) return;

        const params = new URLSearchParams(searchParams.toString());
        params.set("threadId", threadId);
        router.replace(`${pathname}?${params.toString()}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId]);

    async function onReadyConfirmed() {
        if (!session) return;
        setReadyLoading(true);

        const res = await markReadyToAnswer(session.token, props.taskNumber);

        setReadyLoading(false);

        if (!res.ok) {
            if (res.redirectTo) router.replace(res.redirectTo);
            else setError(res.error);
            return;
        }

        router.replace(res.redirectTo);
    }

    // Click handler: open mandatory confirm modal first.
    async function onReady() {
        if (!session) return;
        setReadyConfirmOpen(true);
    }

    if (!session) return null;

    if (loading) {
        return (
            <div className="py-10 space-y-2">
                <h1 className="text-2xl font-semibold text-slate-50">Task {props.taskNumber} - Chat</h1>
                <p className="text-slate-300">Lade Task...</p>
                {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            </div>
        );
    }

    return (
        // Page should be naturally scrollable:
        // - Header/Task can live above.
        // - Chat section below can be "one full viewport tall" on its own.
        // So when you scroll to the chat, it occupies exactly the visible browser area (dvh-aware).
        <div className="min-h-0 flex flex-col py-4">
            {/* Mandatory confirmation modal for leaving chat -> post survey */}
            <ConfirmModal
                open={readyConfirmOpen}
                title="Bestätigen"
                description="Willst du wirklich zur Nachbefragung wechseln? Du kannst danach nicht mehr in den Chat zurück."
                confirmLabel="Ja, weiter"
                cancelLabel="Nein"
                confirmLoading={readyLoading}
                onCancelAction={() => setReadyConfirmOpen(false)}
                onConfirmAction={() => {
                    setReadyConfirmOpen(false);
                    void onReadyConfirmed();
                }}
            />

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <header className="shrink-0 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-semibold text-slate-50">
                                Task {props.taskNumber} - Chat
                            </h1>
                            <p className="text-slate-300">
                                {title} {sidePanelEnabled ? "• Side Panel aktiv" : ""}
                            </p>
                        </div>

                        {/* Ready button + prominent guidance popup (requested) */}
                        <div className="relative sm:w-auto w-full">
                            <Button onClick={onReady} disabled={readyLoading} className="sm:w-auto w-full">
                                {readyLoading ? "Bitte warten..." : "Bereit zum Beantworten"}
                            </Button>

                            {readyHintOpen ? (
                                <div className="absolute right-0 top-full z-30 mt-3 w-[22rem] max-w-[90vw]">
                                    <div
                                        className="relative overflow-hidden rounded-2xl border border-rose-500/40 bg-rose-950/90 p-4 text-sm text-rose-50 shadow-lg backdrop-blur">
                                        {/* little arrow */}
                                        <div
                                            className="absolute -top-2 right-10 h-4 w-4 rotate-45 border-l border-t border-rose-500/40 bg-rose-950/90"/>

                                        <button
                                            type="button"
                                            aria-label="Hinweis schließen"
                                            className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-xl hover:bg-white/10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                dismissReadyHint();
                                            }}
                                        >
                                            <X className="size-4"/>
                                        </button>

                                        <div className="pr-8">
                                            <div
                                                className="text-xs font-semibold uppercase tracking-wide text-rose-100/90">
                                                Hinweis
                                            </div>
                                            <div className="mt-1 leading-relaxed">
                                                Wenn du dich bereit fühlst, die Aufgabe zu beantworten,
                                                dann drücke auf <span
                                                className="font-semibold">„Bereit zum Beantworten“</span>.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Task description: modern “chip-like” collapsible bar (more prominent + click target),
                        plus a bottom collapse button when opened. */}
                    <div className="rounded-2xl border border-slate-700/40 bg-black/25">
                        <div
                            className={[
                                "flex items-center justify-between gap-3 px-4 py-3",
                                "cursor-pointer select-none",
                                "hover:bg-white/5",
                            ].join(" ")}
                            role="button"
                            aria-expanded={taskOpen}
                            tabIndex={0}
                            onClick={() => setTaskOpen((p) => !p)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setTaskOpen((p) => !p);
                                }
                            }}
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-200">
                                    Task-Beschreibung
                                </div>
                                <div className="text-xs text-slate-400">
                                    {taskOpen ? "Zum Ausblenden klicken" : "Zum Anzeigen klicken"}
                                </div>
                            </div>

                            <div
                                className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-700/40 bg-black/20 px-3 py-2">
                                <span className="text-xs font-medium text-slate-200">
                                    {taskOpen ? "Hide" : "Show"}
                                </span>
                                <ChevronDown
                                    className={[
                                        "size-5 text-slate-200 transition-transform",
                                        taskOpen ? "rotate-180" : "rotate-0",
                                    ].join(" ")}
                                />
                            </div>
                        </div>

                        {taskOpen ? (
                            <div className="px-4 pb-4">
                                <div
                                    className="mt-1 rounded-2xl border border-slate-700/30 bg-black/20 p-4 text-sm text-slate-200">
                                    <MarkdownText>
                                        {promptMarkdown}
                                    </MarkdownText>

                                    {/* Collapse affordance at the bottom (so you don't need to scroll back up). */}
                                    <div className="mt-4 flex justify-end">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-slate-600/60 bg-transparent text-slate-200 hover:bg-white/5"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setTaskOpen(false);
                                            }}
                                        >
                                            Task verkleinern
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </header>

                {/* Chat Panel:
                    - NOT "fill remaining height".
                    - Instead: this section itself is one full visible viewport tall (dvh-aware),
                      so you can scroll to it and then it's exactly screen-height. */}
                <section
                    className="chat-light h-[95dvh] min-h-0 overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-sm"
                >
                    <div className="h-full min-h-0">
                        {props.children}
                    </div>
                </section>

                {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            </div>
        </div>
    );
}
