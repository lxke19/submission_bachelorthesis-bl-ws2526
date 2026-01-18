// app/(management)/management/(protected)/participants/[participantId]/page.tsx
//
// Purpose:
// - Management details view for one participant.
// - Show current progress state (status, step, started/completed, last active).
//
// Why:
// - Admin needs a quick “where is this participant right now?” view.
// - Later we extend with tabs: Surveys, TaskSessions, Chat transcript.
//
// EXTENSION (Usage + Inputs):
// - Also show participant usage metrics and inputs:
//   - Access logs (re-entries)
//   - TaskSessions (durations, message counts, restarts, side panel usage)
//   - Surveys (durations + human-readable answers)
//   - Chat input excerpts (USER messages) grouped by task/thread via <details>

import Link from "next/link";
import {prisma} from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

function msBetween(a: Date | null, b: Date | null): number | null {
    if (!a || !b) return null;
    const d = b.getTime() - a.getTime();
    return Number.isFinite(d) && d >= 0 ? d : null;
}

function formatDuration(ms: number | null): string {
    if (ms === null) return "—";
    const sec = Math.round(ms / 1000);
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    if (min <= 0) return `${rem}s`;
    return `${min}m ${rem}s`;
}

type HumanReadableAnswerValue = string | number | string[] | null;

function toHumanReadableAnswer(args: {
    questionType: string;
    numericValue: number | null;
    textValue: string | null;
    selectedOptionLabel: string | null;
    selectedOptionLabels: string[];
}): HumanReadableAnswerValue {
    if (args.questionType === "SCALE_NRS") return typeof args.numericValue === "number" ? args.numericValue : null;
    if (args.questionType === "TEXT") return args.textValue ?? "";
    if (args.questionType === "SINGLE_CHOICE") return args.selectedOptionLabel ?? "";
    // MULTI_CHOICE
    return args.selectedOptionLabels;
}

export default async function ManagementParticipantDetailsPage({
                                                                   params,
                                                               }: {
    params: Promise<{ participantId: string }>;
}) {
    const {participantId} = await params;

    const p = await prisma.participant.findUnique({
        where: {id: participantId},
        select: {
            id: true,
            accessCode: true,
            participantLabel: true,
            status: true,
            currentStep: true,
            currentTaskNumber: true,
            assignedVariant: true,
            sidePanelEnabled: true,
            startedAt: true,
            completedAt: true,
            lastActiveAt: true,
            reentryCount: true,
            createdAt: true,
            updatedAt: true,
            study: {select: {id: true, key: true, name: true}},
        },
    });

    if (!p) {
        return (
            <div className="space-y-3">
                <h1 className="text-2xl font-semibold tracking-tight">Participant not found</h1>
                <Link href="/management/participants" className="text-rose-100 hover:underline">
                    Back to list
                </Link>
            </div>
        );
    }

    // Access logs (re-entry attempts)
    const accessLogs = await prisma.participantAccessLog.findMany({
        where: {participantId},
        orderBy: [{enteredAt: "desc"}],
        take: 50,
        select: {
            id: true,
            enteredAt: true,
            userAgent: true,
        },
    });

    // Task sessions (usage metrics + chat inputs)
    const sessions = await prisma.taskSession.findMany({
        where: {participantId},
        orderBy: [{taskNumber: "asc"}],
        select: {
            id: true,
            taskNumber: true,
            startedAt: true,
            chatStartedAt: true,
            chatEndedAt: true,
            readyToAnswerAt: true,
            postSurveyStartedAt: true,
            postSurveySubmittedAt: true,
            userMessageCount: true,
            assistantMessageCount: true,
            chatRestartCount: true,
            sidePanelOpenCount: true,
            sidePanelCloseCount: true,
            sidePanelOpenMs: true,
            chatThreads: {
                orderBy: [{restartIndex: "asc"}],
                select: {
                    id: true,
                    restartIndex: true,
                    status: true,
                    closeReason: true,
                    createdAt: true,
                    closedAt: true,
                    messages: {
                        orderBy: [{sequence: "asc"}],
                        select: {
                            id: true,
                            role: true,
                            sequence: true,
                            createdAt: true,
                            content: true,
                        },
                    },
                },
            },
        },
    });

    // Surveys (usage + inputs / answers)
    const surveyInstances = await prisma.surveyInstance.findMany({
        where: {participantId},
        orderBy: [{startedAt: "asc"}],
        select: {
            id: true,
            phase: true,
            startedAt: true,
            submittedAt: true,
            taskSessionId: true,
            surveyTemplate: {select: {id: true, key: true, name: true}},
            answers: {
                orderBy: [{createdAt: "asc"}],
                select: {
                    id: true,
                    createdAt: true,
                    numericValue: true,
                    textValue: true,
                    selectedOption: {select: {label: true}},
                    selectedOptions: {
                        select: {option: {select: {label: true, order: true}}},
                        orderBy: {option: {order: "asc"}},
                    },
                    question: {
                        select: {
                            id: true,
                            key: true,
                            text: true,
                            type: true,
                            order: true,
                        },
                    },
                },
            },
        },
    });

    const totalParticipantDurationMs =
        p.startedAt && p.completedAt ? msBetween(p.startedAt, p.completedAt) : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Participant details</h1>
                </div>

                <Link
                    href="/management/participants"
                    className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-rose-900/25 hover:text-rose-100"
                >
                    ← Back
                </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-3">
                    <h2 className="text-base font-semibold text-slate-50">Identity</h2>

                    <div className="text-sm text-slate-200">
                        <div>
                            <span className="text-slate-400">Label:</span>{" "}
                            {p.participantLabel ?? <span className="text-slate-500">—</span>}
                        </div>
                        <div className="font-mono text-xs mt-2">
                            <span className="text-slate-400">Access code:</span>{" "}
                            <span className="text-rose-100">{p.accessCode}</span>
                        </div>
                        <div className="mt-2">
                            <span className="text-slate-400">Study:</span>{" "}
                            {p.study.key} <span className="text-slate-500">— {p.study.name}</span>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-3">
                    <h2 className="text-base font-semibold text-slate-50">Progress</h2>

                    <div className="text-sm text-slate-200 space-y-1">
                        <div>
                            <span className="text-slate-400">Status:</span> {p.status}
                        </div>
                        <div>
                            <span className="text-slate-400">Current step:</span> {p.currentStep}
                        </div>
                        <div>
                            <span className="text-slate-400">Variant:</span> {p.assignedVariant}
                        </div>
                        <div>
                            <span className="text-slate-400">Side panel:</span>{" "}
                            {p.sidePanelEnabled ? "enabled" : "disabled"}
                        </div>
                        <div className="pt-2">
                            <span className="text-slate-400">Started at:</span>{" "}
                            {p.startedAt ? new Date(p.startedAt).toLocaleString() : "—"}
                        </div>
                        <div>
                            <span className="text-slate-400">Completed at:</span>{" "}
                            {p.completedAt ? new Date(p.completedAt).toLocaleString() : "—"}
                        </div>
                        <div>
                            <span className="text-slate-400">Last active:</span>{" "}
                            {p.lastActiveAt ? new Date(p.lastActiveAt).toLocaleString() : "—"}
                        </div>
                        <div>
                            <span className="text-slate-400">Entry count:</span> {p.reentryCount}
                        </div>
                        <div className="pt-2">
                            <span className="text-slate-400">Total duration (Start → End):</span>{" "}
                            <span className="text-slate-200">{formatDuration(totalParticipantDurationMs)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Usage + inputs */}
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Access logs */}
                <div className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-3">
                    <h2 className="text-base font-semibold text-slate-50">Access logs (Re-entries)</h2>

                    {accessLogs.length === 0 ? (
                        <div className="text-sm text-slate-400">No access logs.</div>
                    ) : (
                        <div className="overflow-auto rounded-xl border border-rose-900/20">
                            <table className="w-full border-collapse text-sm">
                                <thead className="bg-black/20 text-slate-200">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Entered at</th>
                                    <th className="px-3 py-2 text-left font-semibold">User-Agent</th>
                                </tr>
                                </thead>
                                <tbody>
                                {accessLogs.map((l) => (
                                    <tr key={l.id} className="border-t border-rose-900/15">
                                        <td className="px-3 py-2 text-slate-200">
                                            {new Date(l.enteredAt).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-slate-300">
                                            {l.userAgent ?? <span className="text-slate-500">—</span>}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Task sessions */}
                <div className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-3">
                    <h2 className="text-base font-semibold text-slate-50">Task usage (Sessions)</h2>

                    {sessions.length === 0 ? (
                        <div className="text-sm text-slate-400">No task sessions yet.</div>
                    ) : (
                        <div className="overflow-auto rounded-xl border border-rose-900/20">
                            <table className="w-full border-collapse text-sm">
                                <thead className="bg-black/20 text-slate-200">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Task</th>
                                    <th className="px-3 py-2 text-right font-semibold">Chat</th>
                                    <th className="px-3 py-2 text-right font-semibold">Post-Survey</th>
                                    <th className="px-3 py-2 text-right font-semibold">Msgs (U/A)</th>
                                    <th className="px-3 py-2 text-right font-semibold">Restarts</th>
                                    <th className="px-3 py-2 text-right font-semibold">Sidepanel</th>
                                </tr>
                                </thead>
                                <tbody>
                                {sessions.map((s) => {
                                    const chatEnd = s.chatEndedAt ?? s.readyToAnswerAt;
                                    const chatMs = s.chatStartedAt && chatEnd ? msBetween(s.chatStartedAt, chatEnd) : null;
                                    const postMs =
                                        s.postSurveyStartedAt && s.postSurveySubmittedAt
                                            ? msBetween(s.postSurveyStartedAt, s.postSurveySubmittedAt)
                                            : null;

                                    const sidePanelMs = (() => {
                                        const n = Number(s.sidePanelOpenMs);
                                        return Number.isFinite(n) && n >= 0 ? n : null;
                                    })();

                                    // Restart rule (derived, deterministic):
                                    // - Thread #0 => 0 restarts
                                    // - Each additional thread => +1 restart
                                    const derivedRestarts = Math.max(0, s.chatThreads.length - 1);

                                    return (
                                        <tr key={s.id} className="border-t border-rose-900/15">
                                            <td className="px-3 py-2 text-slate-50">Task {s.taskNumber}</td>
                                            <td className="px-3 py-2 text-right text-slate-200">{formatDuration(chatMs)}</td>
                                            <td className="px-3 py-2 text-right text-slate-200">{formatDuration(postMs)}</td>
                                            <td className="px-3 py-2 text-right text-slate-200">
                                                {s.userMessageCount}/{s.assistantMessageCount}
                                            </td>
                                            <td className="px-3 py-2 text-right text-slate-200">{derivedRestarts}</td>
                                            <td className="px-3 py-2 text-right text-slate-200">
                                                {formatDuration(sidePanelMs)}{" "}
                                                <span className="text-xs text-slate-500">
                                                    ({s.sidePanelOpenCount} open / {s.sidePanelCloseCount} close)
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Inputs: chat messages + survey answers */}
            <div className="grid gap-4">
                {/* Chat transcript excerpts */}
                <div className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-3">
                    <h2 className="text-base font-semibold text-slate-50">Chat history (messages)</h2>

                    {sessions.length === 0 ? (
                        <div className="text-sm text-slate-400">No task sessions yet.</div>
                    ) : (
                        <div className="space-y-3">
                            {sessions.map((s) => {
                                const derivedRestarts = Math.max(0, s.chatThreads.length - 1);

                                return (
                                    <details key={s.id}
                                             className="rounded-2xl border border-rose-900/20 bg-black/15 p-4">
                                        <summary
                                            className="cursor-pointer select-none text-sm font-semibold text-slate-200">
                                            Task {s.taskNumber}{" "}
                                            <span className="text-xs font-normal text-slate-400">
                                                • threads: {s.chatThreads.length} • restarts: {derivedRestarts}
                                            </span>
                                        </summary>

                                        <div className="mt-3 space-y-3">
                                            {s.chatThreads.length === 0 ? (
                                                <div className="text-sm text-slate-400">No threads.</div>
                                            ) : (
                                                s.chatThreads.map((t) => {
                                                    return (
                                                        <details
                                                            key={t.id}
                                                            className="rounded-2xl border border-rose-900/15 bg-black/10 p-3"
                                                        >
                                                            <summary
                                                                className="cursor-pointer select-none text-sm font-semibold text-slate-200">
                                                                Thread #{t.restartIndex} • {t.status}
                                                                {t.closeReason ? ` • ${t.closeReason}` : ""}{" "}
                                                                <span className="text-xs font-normal text-slate-400">
                                                                    • messages: {t.messages.length}
                                                                </span>
                                                            </summary>

                                                            <div className="mt-3 space-y-2">
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
                                                                                    #{m.sequence} • {m.role}
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
                                                    );
                                                })
                                            )}
                                        </div>
                                    </details>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Survey answers */}
                <div className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-3">
                    <h2 className="text-base font-semibold text-slate-50">Survey inputs (Answers)</h2>

                    {surveyInstances.length === 0 ? (
                        <div className="text-sm text-slate-400">No survey instances yet.</div>
                    ) : (
                        <div className="space-y-3">
                            {surveyInstances.map((si) => {
                                const dur = msBetween(si.startedAt, si.submittedAt);
                                const answersSorted = [...si.answers].sort(
                                    (a, b) => (a.question.order ?? 0) - (b.question.order ?? 0),
                                );

                                return (
                                    <details key={si.id}
                                             className="rounded-2xl border border-rose-900/20 bg-black/15 p-4">
                                        <summary
                                            className="cursor-pointer select-none text-sm font-semibold text-slate-200">
                                            {si.phase}{" "}
                                            <span className="text-xs font-normal text-slate-400">
                                                • {si.surveyTemplate.key} ({si.surveyTemplate.name}) • duration:{" "}
                                                {formatDuration(dur)}
                                                {si.submittedAt ? "" : " • (not submitted)"}
                                            </span>
                                        </summary>

                                        <div className="mt-3 space-y-2">
                                            <div className="text-xs text-slate-400">
                                                startedAt:{" "}
                                                <span
                                                    className="text-slate-200">{new Date(si.startedAt).toLocaleString()}</span>
                                                {" • "}
                                                submittedAt:{" "}
                                                <span className="text-slate-200">
                                                    {si.submittedAt ? new Date(si.submittedAt).toLocaleString() : "—"}
                                                </span>
                                                {si.taskSessionId ? (
                                                    <>
                                                        {" • "}
                                                        <span className="text-slate-400">taskSessionId:</span>{" "}
                                                        <span className="font-mono text-[11px] text-slate-300">
                                                            {si.taskSessionId}
                                                        </span>
                                                    </>
                                                ) : null}
                                            </div>

                                            {answersSorted.length === 0 ? (
                                                <div className="text-sm text-slate-400">No answers stored.</div>
                                            ) : (
                                                <div className="overflow-auto rounded-xl border border-rose-900/15">
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
                                                        {answersSorted.map((a) => {
                                                            const value = toHumanReadableAnswer({
                                                                questionType: a.question.type,
                                                                numericValue:
                                                                    typeof a.numericValue === "number" ? a.numericValue : null,
                                                                textValue: a.textValue ?? null,
                                                                selectedOptionLabel: a.selectedOption?.label ?? null,
                                                                selectedOptionLabels: a.selectedOptions.map((x) => x.option.label),
                                                            });

                                                            return (
                                                                <tr key={a.id} className="border-t border-rose-900/10">
                                                                    <td className="px-3 py-2 text-slate-300">{a.question.order}</td>
                                                                    <td className="px-3 py-2 text-slate-50">{a.question.text}</td>
                                                                    <td className="px-3 py-2 text-slate-300">{a.question.key}</td>
                                                                    <td className="px-3 py-2 text-slate-300">{a.question.type}</td>
                                                                    <td className="px-3 py-2 text-slate-200 whitespace-pre-wrap">
                                                                        {Array.isArray(value)
                                                                            ? JSON.stringify(value)
                                                                            : value === null
                                                                                ? "—"
                                                                                : String(value)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
