"use client";

// app/modules/management/dashboard/components/ParticipantModal.tsx
//
// Purpose:
// - Dedicated modal for participant transcript rendering.
// - Keeps ManagementOverviewDashboard.tsx smaller and easier to maintain.
//
// EXTENSION (Timeline completeness):
// - Render full A->Z flow including:
//   - participant-level timing (startedAt/completedAt)
//   - survey durations + survey answers (PRE, TASKn_POST, FINAL)
//   - task chat durations + interactions (messages, restarts, side panel)
// - Provide clear summary metrics and explain labels (e.g., messages User/Assistant).

import React, {useMemo} from "react";
import {Button} from "@/components/ui/button";
import type {ParticipantsListItem} from "../api";
import type {loadParticipantTranscript} from "../api";
import {formatDuration} from "./format";

type TranscriptResponse = Awaited<ReturnType<typeof loadParticipantTranscript>>;

function msBetween(a: string | null, b: string | null): number | null {
    if (!a || !b) return null;
    const t1 = new Date(a).getTime();
    const t2 = new Date(b).getTime();
    const d = t2 - t1;
    return Number.isFinite(d) && d >= 0 ? d : null;
}

function sumMs(values: Array<number | null>): number | null {
    const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
    if (xs.length === 0) return null;
    return xs.reduce((a, b) => a + b, 0);
}

function phaseLabel(phase: string): string {
    // Keep it simple and stable (phase enum strings)
    if (phase === "PRE") return "Pre-Survey";
    if (phase === "FINAL") return "Final-Survey";
    if (phase === "TASK1_POST") return "Task 1 Post-Survey";
    if (phase === "TASK2_POST") return "Task 2 Post-Survey";
    if (phase === "TASK3_POST") return "Task 3 Post-Survey";
    return phase;
}

function phaseSortKey(phase: string): number {
    // deterministic A->Z ordering
    if (phase === "PRE") return 0;
    if (phase === "TASK1_POST") return 2;
    if (phase === "TASK2_POST") return 4;
    if (phase === "TASK3_POST") return 6;
    if (phase === "FINAL") return 8;
    return 999;
}

export default function ParticipantModal(props: {
    participant: ParticipantsListItem;
    transcriptLoading: boolean;
    transcriptError: string | null;
    transcript: TranscriptResponse | null;
    onCloseAction: () => void;
}) {
    const p = props.participant;

    const timeline = useMemo(() => {
        if (!props.transcript || !props.transcript.ok) return null;

        // Normalize surveys: order by phaseSortKey + startedAt as tie-breaker
        const surveys = [...props.transcript.surveys].sort((a, b) => {
            const ka = phaseSortKey(a.phase);
            const kb = phaseSortKey(b.phase);
            if (ka !== kb) return ka - kb;
            return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
        });

        // Task chat duration per session:
        const taskChatDurations = props.transcript.sessions.map((s) => {
            const end = s.chatEndedAt ?? s.readyToAnswerAt;
            return s.chatStartedAt && end ? msBetween(s.chatStartedAt, end) : null;
        });

        // Survey duration per instance:
        const surveyDurations = surveys.map((s) => msBetween(s.startedAt, s.submittedAt));

        const totalDurationMs =
            props.transcript.participant.startedAt && props.transcript.participant.completedAt
                ? msBetween(props.transcript.participant.startedAt, props.transcript.participant.completedAt)
                : null;

        const sumChatMs = sumMs(taskChatDurations);
        const sumSurveyMs = sumMs(surveyDurations);

        const sumSidePanelMs = sumMs(
            props.transcript.sessions.map((s) => {
                const n = Number(s.sidePanelOpenMs);
                return Number.isFinite(n) && n >= 0 ? n : null;
            }),
        );

        // Sidepanel counters (useful even when panel remains open and close never happens)
        const sumSidePanelOpens = props.transcript.sessions.reduce((acc, s) => acc + Number(s.sidePanelOpenCount ?? 0), 0);
        const sumSidePanelCloses = props.transcript.sessions.reduce((acc, s) => acc + Number(s.sidePanelCloseCount ?? 0), 0);

        return {
            surveys,
            totalDurationMs,
            sumChatMs,
            sumSurveyMs,
            sumSidePanelMs,
            sumSidePanelOpens,
            sumSidePanelCloses,
        };
    }, [props.transcript]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={props.onCloseAction}/>
            <div
                className="relative z-[61] w-full max-w-5xl overflow-hidden rounded-2xl border border-rose-900/30 bg-neutral-950 shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-rose-900/20 px-4 py-3">
                    <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-50">
                            Participant Details{" "}
                            <span className="text-xs font-normal text-slate-400">
                                {p.participantLabel ?? "—"} • {p.accessCode}
                            </span>
                        </div>
                        <div className="text-xs text-slate-400">
                            {p.status} • {p.currentStep}
                        </div>
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        className="border-rose-900/40 bg-black/20 text-slate-50 hover:bg-rose-900/25"
                        onClick={props.onCloseAction}
                    >
                        Close
                    </Button>
                </div>

                <div className="max-h-[75vh] overflow-auto p-4 space-y-4">
                    {props.transcriptLoading ? (
                        <div className="text-sm text-slate-400">Lade Transcript...</div>
                    ) : null}
                    {props.transcriptError ? (
                        <div className="text-sm text-rose-300">{props.transcriptError}</div>
                    ) : null}

                    {props.transcript && props.transcript.ok ? (
                        <div className="space-y-4">
                            {/* Timing overview */}
                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-4">
                                <div className="text-sm font-semibold text-slate-200">Timing Overview</div>

                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="rounded-2xl border border-rose-900/15 bg-black/10 p-3">
                                        <div className="text-xs text-slate-400">Gesamt (Start → Ende)</div>
                                        <div className="text-lg font-semibold text-slate-50">
                                            {formatDuration(timeline?.totalDurationMs ?? null)}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-rose-900/15 bg-black/10 p-3">
                                        <div className="text-xs text-slate-400">Summe Chat-Zeit</div>
                                        <div className="text-lg font-semibold text-slate-50">
                                            {formatDuration(timeline?.sumChatMs ?? null)}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-rose-900/15 bg-black/10 p-3">
                                        <div className="text-xs text-slate-400">Summe Survey-Zeit</div>
                                        <div className="text-lg font-semibold text-slate-50">
                                            {formatDuration(timeline?.sumSurveyMs ?? null)}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-rose-900/15 bg-black/10 p-3">
                                        <div className="text-xs text-slate-400">Summe Sidepanel-Open</div>
                                        <div className="text-lg font-semibold text-slate-50">
                                            {formatDuration(timeline?.sumSidePanelMs ?? null)}
                                        </div>
                                        <div className="mt-1 text-[11px] text-slate-400">
                                            Opens/Closes:{" "}
                                            <span className="text-slate-200">{timeline?.sumSidePanelOpens ?? 0}</span>
                                            {" / "}
                                            <span className="text-slate-200">{timeline?.sumSidePanelCloses ?? 0}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 text-xs text-slate-400">
                                    Hinweis: „Gesamt“ nutzt Participant.startedAt → Participant.completedAt. Falls nicht
                                    abgeschlossen, ist das ggf. „—“.
                                    Summen basieren auf vorhandenen Timestamps (z. B. Survey nur wenn submittedAt
                                    vorhanden).
                                    Sidepanel-Zeit (ms) basiert auf TaskSession.sidePanelOpenMs; Opens/Closes sind reine
                                    Zähler und bleiben auch dann aussagekräftig, wenn ein Panel „offen gelassen“ wird.
                                </div>
                            </div>

                            {/* Surveys timeline */}
                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-4">
                                <div className="text-sm font-semibold text-slate-200">Surveys (Dauer + Antworten)</div>

                                {timeline && timeline.surveys.length === 0 ? (
                                    <div className="mt-3 text-sm text-slate-400">No survey instances yet.</div>
                                ) : null}

                                {timeline && timeline.surveys.length > 0 ? (
                                    <div className="mt-3 space-y-3">
                                        {timeline.surveys.map((s) => {
                                            const dur = msBetween(s.startedAt, s.submittedAt);
                                            return (
                                                <details
                                                    key={s.id}
                                                    className="rounded-2xl border border-rose-900/15 bg-black/10 p-3"
                                                >
                                                    <summary
                                                        className="cursor-pointer select-none text-sm font-semibold text-slate-200">
                                                        {phaseLabel(s.phase)}{" "}
                                                        <span className="text-xs font-normal text-slate-400">
                                                            • Template: {s.template.key} ({s.template.name}) • Dauer: {formatDuration(dur)}
                                                            {s.submittedAt ? "" : " • (nicht submitted)"}
                                                        </span>
                                                    </summary>

                                                    <div className="mt-3 space-y-2">
                                                        <div className="text-xs text-slate-400">
                                                            startedAt: <span
                                                            className="text-slate-200">{new Date(s.startedAt).toLocaleString()}</span>
                                                            {" • "}
                                                            submittedAt:{" "}
                                                            <span className="text-slate-200">
                                                                {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                                                            </span>
                                                        </div>

                                                        {s.answers.length === 0 ? (
                                                            <div className="text-sm text-slate-400">No answers
                                                                stored.</div>
                                                        ) : (
                                                            <div
                                                                className="overflow-auto rounded-xl border border-rose-900/15">
                                                                <table className="w-full border-collapse text-sm">
                                                                    <thead className="bg-black/20 text-slate-200">
                                                                    <tr>
                                                                        <th className="px-3 py-2 text-left font-semibold">#</th>
                                                                        <th className="px-3 py-2 text-left font-semibold">Question</th>
                                                                        <th className="px-3 py-2 text-left font-semibold">Key</th>
                                                                        <th className="px-3 py-2 text-left font-semibold">Type</th>
                                                                        <th className="px-3 py-2 text-left font-semibold">Answer</th>
                                                                    </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                    {s.answers.map((a) => (
                                                                        <tr key={a.id}
                                                                            className="border-t border-rose-900/10">
                                                                            <td className="px-3 py-2 text-slate-300">{a.question.order}</td>
                                                                            <td className="px-3 py-2 text-slate-50">{a.question.text}</td>
                                                                            <td className="px-3 py-2 text-slate-300">{a.question.key}</td>
                                                                            <td className="px-3 py-2 text-slate-300">{a.question.type}</td>
                                                                            <td className="px-3 py-2 text-slate-200 whitespace-pre-wrap">
                                                                                {Array.isArray(a.value)
                                                                                    ? JSON.stringify(a.value)
                                                                                    : a.value === null
                                                                                        ? "—"
                                                                                        : String(a.value)}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                </details>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>

                            {/* Tasks timeline (chat) */}
                            <div className="rounded-2xl border border-rose-900/20 bg-black/15 p-4">
                                <div className="text-sm font-semibold text-slate-200">Tasks (Chat + Threads +
                                    Messages)
                                </div>

                                {props.transcript.sessions.length === 0 ? (
                                    <div className="mt-3 text-sm text-slate-400">No task sessions yet.</div>
                                ) : (
                                    <div className="mt-3 space-y-4">
                                        {props.transcript.sessions.map((s) => {
                                            const end = s.chatEndedAt ?? s.readyToAnswerAt;
                                            const chatMs =
                                                s.chatStartedAt && end
                                                    ? msBetween(s.chatStartedAt, end)
                                                    : null;

                                            const postMs =
                                                s.postSurveyStartedAt && s.postSurveySubmittedAt
                                                    ? msBetween(s.postSurveyStartedAt, s.postSurveySubmittedAt)
                                                    : null;

                                            // If opens > closes, it might have been left open (intentionally allowed by your rules).
                                            const sidePanelPossiblyLeftOpen = s.sidePanelOpenCount > s.sidePanelCloseCount;

                                            return (
                                                <div key={s.id}
                                                     className="rounded-2xl border border-rose-900/20 bg-black/15 p-4">
                                                    <div
                                                        className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="text-sm font-semibold text-slate-200">
                                                            Task {s.taskNumber}
                                                        </div>
                                                        <div className="text-xs text-slate-400">
                                                            Chat-Dauer: {formatDuration(chatMs)}{" "}
                                                            • Post-Survey-Dauer
                                                            (TaskSession): {formatDuration(postMs)}{" "}
                                                            • Nachrichten
                                                            (User/Assistant): {s.userMessageCount}/{s.assistantMessageCount}{" "}
                                                            • Restarts: {s.chatRestartCount}{" "}
                                                            •
                                                            Sidepanel: {formatDuration(Number.isFinite(Number(s.sidePanelOpenMs)) ? Number(s.sidePanelOpenMs) : null)}
                                                            {" "}
                                                            •
                                                            Opens/Closes: {s.sidePanelOpenCount}/{s.sidePanelCloseCount}
                                                            {sidePanelPossiblyLeftOpen ? " • (evtl. offen gelassen)" : ""}
                                                        </div>
                                                    </div>

                                                    <div className="mt-2 text-xs text-slate-500">
                                                        Hinweis: „Nachrichten (User/Assistant)“ sind reine Zähler über
                                                        alle Threads dieser TaskSession.
                                                        „Restarts“ entspricht chatRestartCount.
                                                        Sidepanel „Opens/Closes“ sind robuste Nutzungs-Indikatoren, auch
                                                        wenn ein Panel offen bleibt und kein Close-Event geschrieben
                                                        wurde.
                                                    </div>

                                                    {s.threads.length === 0 ? (
                                                        <div className="mt-3 text-sm text-slate-400">No threads
                                                            yet.</div>
                                                    ) : (
                                                        <div className="mt-3 space-y-3">
                                                            {s.threads.map((t) => (
                                                                <details
                                                                    key={t.id}
                                                                    className="rounded-2xl border border-rose-900/15 bg-black/10 p-3"
                                                                >
                                                                    <summary
                                                                        className="cursor-pointer select-none text-sm font-semibold text-slate-200">
                                                                        Thread #{t.restartIndex} • {t.status}
                                                                        {t.closeReason ? ` • ${t.closeReason}` : ""}{" "}
                                                                        <span
                                                                            className="text-xs font-normal text-slate-400">
                                                                            ({t.messages.length} messages)
                                                                        </span>
                                                                    </summary>

                                                                    <div className="mt-3 space-y-2">
                                                                        <div className="text-xs text-slate-400">
                                                                            createdAt: <span
                                                                            className="text-slate-200">{new Date(t.createdAt).toLocaleString()}</span>
                                                                            {" • "}
                                                                            closedAt:{" "}
                                                                            <span className="text-slate-200">
                                                                                {t.closedAt ? new Date(t.closedAt).toLocaleString() : "—"}
                                                                            </span>
                                                                        </div>

                                                                        {t.messages.length === 0 ? (
                                                                            <div className="text-sm text-slate-400">No
                                                                                messages.</div>
                                                                        ) : (
                                                                            t.messages.map((m) => (
                                                                                <div
                                                                                    key={m.id}
                                                                                    className="rounded-xl border border-rose-900/10 bg-black/10 p-3"
                                                                                >
                                                                                    <div
                                                                                        className="flex items-center justify-between gap-2">
                                                                                        <div
                                                                                            className="text-xs font-semibold text-slate-200">
                                                                                            {m.sequence}. {m.role}
                                                                                        </div>
                                                                                        <div
                                                                                            className="text-[11px] text-slate-500">
                                                                                            {new Date(m.createdAt).toLocaleString()}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div
                                                                                        className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                                                                                        {m.content}
                                                                                    </div>
                                                                                </div>
                                                                            ))
                                                                        )}
                                                                    </div>
                                                                </details>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
