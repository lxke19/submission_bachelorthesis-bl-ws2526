// app/api/management/dashboard/route.ts
//
// Purpose:
// - Management Overview API (admin-only).
// - Returns either:
//   - mode=all: global KPIs + per-study breakdown
//   - mode=study: KPIs + task summaries + survey phase summaries for a single study
//
// Notes:
// - Robust empty-state handling: returns 0/— when no data exists.
// - Heavy details (participant transcripts, raw answers) are fetched via dedicated endpoints.

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireAuthenticatedUser} from "@/app/lib/auth";
import {Prisma} from "@/app/generated/prisma/client";

function avg(values: number[]): number | null {
    if (values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
}

function toMs(d: Date): number {
    return d.getTime();
}

const ALLOWED_SURVEY_PHASES = ["PRE", "TASK1_POST", "TASK2_POST", "TASK3_POST", "FINAL"] as const;
type AllowedSurveyPhase = (typeof ALLOWED_SURVEY_PHASES)[number];

function isAllowedSurveyPhase(x: string): x is AllowedSurveyPhase {
    return (ALLOWED_SURVEY_PHASES as readonly string[]).includes(x);
}

/**
 * Side Panel Duration (Dashboard aggregates)
 * =========================================
 *
 * Same rule as transcript view:
 * - If a session has an open SidePanelSpan (closedAt=null), we treat it as open until "task end".
 * - This prevents averages from being artificially pulled down by open-left-open spans.
 *
 * We do this at READ TIME only (no DB writes).
 */
function pickBestEffortTaskEndAt(args: {
    chatEndedAt: Date | null;
    readyToAnswerAt: Date | null;
    postSurveyStartedAt: Date | null;
    postSurveySubmittedAt: Date | null;
    participantCompletedAt: Date | null;
    participantLastActiveAt: Date | null;
}): Date {
    return (
        args.chatEndedAt ??
        args.readyToAnswerAt ??
        args.postSurveyStartedAt ??
        args.postSurveySubmittedAt ??
        args.participantCompletedAt ??
        args.participantLastActiveAt ??
        new Date()
    );
}

function safeDeltaMs(from: Date, to: Date): number {
    const d = to.getTime() - from.getTime();
    return Number.isFinite(d) && d >= 0 ? d : 0;
}

export async function GET(req: NextRequest) {
    const user = await requireAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ok: false, error: "Unauthorized"}, {status: 401});
    }

    const url = new URL(req.url);
    const studyId = url.searchParams.get("studyId");

    const studies = await prisma.study.findMany({
        select: {id: true, key: true, name: true},
        orderBy: {createdAt: "asc"},
    });

    // Helper: compute average total duration for completed participants
    async function computeAvgTotalDurationMs(where: Prisma.ParticipantWhereInput): Promise<number | null> {
        const completed = await prisma.participant.findMany({
            where: {
                ...where,
                OR: [{status: "COMPLETED"}, {currentStep: "DONE"}],
                startedAt: {not: null},
                completedAt: {not: null},
            },
            select: {startedAt: true, completedAt: true},
        });

        const durations = completed
            .map((p) => {
                if (!p.startedAt || !p.completedAt) return null;
                return toMs(p.completedAt) - toMs(p.startedAt);
            })
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0);

        return avg(durations);
    }

    if (!studyId) {
        const participantsTotal = await prisma.participant.count();
        const participantsCompleted = await prisma.participant.count({
            where: {OR: [{status: "COMPLETED"}, {currentStep: "DONE"}]},
        });
        const participantsInProgress = await prisma.participant.count({
            where: {status: "STARTED", NOT: [{status: "COMPLETED"}, {currentStep: "DONE"}]},
        });
        const participantsNotStarted = await prisma.participant.count({
            where: {status: "CREATED"},
        });

        const completionRate = participantsTotal > 0 ? participantsCompleted / participantsTotal : null;
        const avgTotalDurationMs = await computeAvgTotalDurationMs({});

        // per-study breakdown
        const byStudy = await prisma.study.findMany({
            select: {id: true, key: true, name: true},
            orderBy: {createdAt: "asc"},
        });

        const breakdown = await Promise.all(
            byStudy.map(async (s) => {
                const total = await prisma.participant.count({where: {studyId: s.id}});
                const completed = await prisma.participant.count({
                    where: {studyId: s.id, OR: [{status: "COMPLETED"}, {currentStep: "DONE"}]},
                });
                const inProgress = await prisma.participant.count({
                    where: {studyId: s.id, status: "STARTED", NOT: [{status: "COMPLETED"}, {currentStep: "DONE"}]},
                });
                const notStarted = await prisma.participant.count({
                        where: {studyId: s.id, status: "CREATED"}
                    },
                );

                const rate = total > 0 ? completed / total : null;
                const dur = await computeAvgTotalDurationMs({studyId: s.id});

                return {
                    studyId: s.id,
                    key: s.key,
                    name: s.name,
                    participantsTotal: total,
                    participantsCompleted: completed,
                    participantsInProgress: inProgress,
                    participantsNotStarted: notStarted,
                    completionRate: rate,
                    avgTotalDurationMs: dur,
                };
            }),
        );

        return NextResponse.json({
            ok: true,
            studies,
            selection: {studyId: null},
            mode: "all",
            global: {
                kpis: {
                    studiesTotal: studies.length,
                    participantsTotal,
                    participantsCompleted,
                    participantsInProgress,
                    participantsNotStarted,
                    completionRate,
                    avgTotalDurationMs,
                },
                breakdown,
            },
        });
    }

    const study = await prisma.study.findUnique({
        where: {id: studyId},
        select: {id: true, key: true, name: true},
    });

    if (!study) {
        return NextResponse.json({ok: false, error: "Study not found"}, {status: 404});
    }

    const participantsTotal = await prisma.participant.count({where: {studyId}});
    const participantsCompleted = await prisma.participant.count({
        where: {studyId, OR: [{status: "COMPLETED"}, {currentStep: "DONE"}]},
    });
    const participantsInProgress = await prisma.participant.count({
        where: {studyId, status: "STARTED", NOT: [{status: "COMPLETED"}, {currentStep: "DONE"}]},
    });
    const participantsNotStarted = await prisma.participant.count({
        where: {studyId, status: "CREATED"},
    });

    const completionRate = participantsTotal > 0 ? participantsCompleted / participantsTotal : null;

    const variantSplitRaw = await prisma.participant.groupBy({
        by: ["assignedVariant"],
        where: {studyId},
        _count: {_all: true},
    });

    const sidePanelSplitRaw = await prisma.participant.groupBy({
        by: ["sidePanelEnabled"],
        where: {studyId},
        _count: {_all: true},
    });

    const avgTotalDurationMs = await computeAvgTotalDurationMs({studyId});

    const sessions = await prisma.taskSession.findMany({
        where: {participant: {studyId}},
        select: {
            taskNumber: true,
            chatStartedAt: true,
            chatEndedAt: true,
            readyToAnswerAt: true,
            hasChattedAtLeastOnce: true,
            userMessageCount: true,
            assistantMessageCount: true,
            chatRestartCount: true,
            sidePanelOpenCount: true,
            sidePanelOpenMs: true,
            // NEW: post-survey duration on task-session level
            postSurveyStartedAt: true,
            postSurveySubmittedAt: true,

            // NEW: best-effort end timestamps need participant-level time
            participant: {
                select: {
                    lastActiveAt: true,
                    completedAt: true,
                },
            },

            // NEW: detect open-left-open spans (latest only)
            sidePanelSpans: {
                where: {closedAt: null},
                orderBy: {openedAt: "desc"},
                take: 1,
                select: {
                    openedAt: true,
                },
            },
        },
    });

    const taskNumbers = Array.from(new Set(sessions.map((s) => s.taskNumber))).sort((a, b) => a - b);

    const taskSummaries = taskNumbers.map((n) => {
        const rows = sessions.filter((s) => s.taskNumber === n);

        // Chat phase duration: chatStartedAt -> chatEndedAt OR readyToAnswerAt
        const chatDurations = rows
            .map((r) => {
                if (!r.chatStartedAt) return null;
                const end = r.chatEndedAt ?? r.readyToAnswerAt;
                if (!end) return null;
                return toMs(end) - toMs(r.chatStartedAt);
            })
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0);

        // Post-survey duration: postSurveyStartedAt -> postSurveySubmittedAt
        const postSurveyDurations = rows
            .map((r) => {
                if (!r.postSurveyStartedAt || !r.postSurveySubmittedAt) return null;
                return toMs(r.postSurveySubmittedAt) - toMs(r.postSurveyStartedAt);
            })
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0);

        const userMsgs = rows.map((r) => r.userMessageCount).filter((x) => Number.isFinite(x));
        const assistantMsgs = rows.map((r) => r.assistantMessageCount).filter((x) => Number.isFinite(x));
        const restarts = rows.map((r) => r.chatRestartCount).filter((x) => Number.isFinite(x));

        // EFFECTIVE side panel open ms (fix "open left open" => not 0)
        const sideOpenMs = rows
            .map((r) => {
                let stored: number | null;
                try {
                    stored = Number(r.sidePanelOpenMs);
                } catch {
                    stored = null;
                }
                if (stored === null || !Number.isFinite(stored) || stored < 0) return null;

                const openSpan = Array.isArray((r as any).sidePanelSpans) && (r as any).sidePanelSpans.length > 0
                    ? (r as any).sidePanelSpans[0]
                    : null;

                if (!openSpan?.openedAt) return stored;

                const endAt = pickBestEffortTaskEndAt({
                    chatEndedAt: r.chatEndedAt ?? null,
                    readyToAnswerAt: r.readyToAnswerAt ?? null,
                    postSurveyStartedAt: r.postSurveyStartedAt ?? null,
                    postSurveySubmittedAt: r.postSurveySubmittedAt ?? null,
                    participantCompletedAt: r.participant?.completedAt ?? null,
                    participantLastActiveAt: r.participant?.lastActiveAt ?? null,
                });

                const extra = safeDeltaMs(openSpan.openedAt, endAt);
                return stored + Math.floor(extra);
            })
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0);

        const postSurveyStartedCount = rows.filter((r) => r.postSurveyStartedAt !== null).length;
        const postSurveySubmittedCount = rows.filter((r) => r.postSurveySubmittedAt !== null).length;

        // Sidepanel adoption metrics:
        // - IMPORTANT: These are valid even if the user "leaves the chat" and the panel remains open.
        //   We measure "used" by open events (sidePanelOpenCount > 0), not by close/finalization.
        const sidePanelUsedSessionsCount = rows.filter((r) => r.sidePanelOpenCount > 0).length;

        // Average opens per session (engagement intensity).
        const sidePanelOpens = rows.map((r) => r.sidePanelOpenCount).filter((x) => Number.isFinite(x));
        const avgSidePanelOpens = avg(sidePanelOpens);

        // Average open time but only for sessions where it was used at least once.
        // Note: with the effective fix above, this is now robust even if close events never arrived.
        const sideOpenMsWhenUsed = rows
            .filter((r) => r.sidePanelOpenCount > 0)
            .map((r) => {
                let stored: number | null;
                try {
                    stored = Number(r.sidePanelOpenMs);
                } catch {
                    stored = null;
                }
                if (stored === null || !Number.isFinite(stored) || stored < 0) return null;

                const openSpan = Array.isArray((r as any).sidePanelSpans) && (r as any).sidePanelSpans.length > 0
                    ? (r as any).sidePanelSpans[0]
                    : null;

                if (!openSpan?.openedAt) return stored;

                const endAt = pickBestEffortTaskEndAt({
                    chatEndedAt: r.chatEndedAt ?? null,
                    readyToAnswerAt: r.readyToAnswerAt ?? null,
                    postSurveyStartedAt: r.postSurveyStartedAt ?? null,
                    postSurveySubmittedAt: r.postSurveySubmittedAt ?? null,
                    participantCompletedAt: r.participant?.completedAt ?? null,
                    participantLastActiveAt: r.participant?.lastActiveAt ?? null,
                });

                const extra = safeDeltaMs(openSpan.openedAt, endAt);
                return stored + Math.floor(extra);
            })
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0);

        return {
            taskNumber: n,
            sessionsTotal: rows.length,

            // Chat gating/engagement
            readyToAnswerCount: rows.filter((r) => r.readyToAnswerAt !== null).length,
            hasChattedAtLeastOnceCount: rows.filter((r) => r.hasChattedAtLeastOnce).length,

            // Averages (chat)
            avgChatDurationMs: avg(chatDurations),
            avgUserMessages: avg(userMsgs),
            avgAssistantMessages: avg(assistantMsgs),
            avgRestarts: avg(restarts),

            // Side panel
            avgSidePanelOpenMs: avg(sideOpenMs),
            sidePanelOpenCountTotal: rows.reduce((acc, r) => acc + r.sidePanelOpenCount, 0),

            // NEW: Sidepanel adoption/intensity (session-based)
            sidePanelUsedSessionsCount,
            sidePanelUsageRate: rows.length > 0 ? sidePanelUsedSessionsCount / rows.length : null,
            avgSidePanelOpens,
            avgSidePanelOpenMsWhenUsed: avg(sideOpenMsWhenUsed),

            // NEW: Post-survey summary (task-session level)
            postSurveyStartedCount,
            postSurveySubmittedCount,
            postSurveySubmissionRate: postSurveyStartedCount > 0 ? postSurveySubmittedCount / postSurveyStartedCount : null,
            avgPostSurveyDurationMs: avg(postSurveyDurations),
        };
    });

    const surveyInstances = await prisma.surveyInstance.findMany({
        where: {participant: {studyId}},
        select: {phase: true, startedAt: true, submittedAt: true},
    });

    const phases = Array.from(new Set(surveyInstances.map((s) => s.phase))).sort();

    const surveySummaries = phases.map((phase) => {
        const rows = surveyInstances.filter((s) => s.phase === phase);
        const submitted = rows.filter((r) => r.submittedAt !== null);
        const durations = submitted
            .map((r) => (r.submittedAt ? toMs(r.submittedAt) - toMs(r.startedAt) : null))
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0);

        // We keep phase as-is (server already uses canonical enum strings).
        // If phase values evolve, UI handles unknown phases gracefully.
        const phaseString = isAllowedSurveyPhase(phase) ? phase : String(phase);

        return {
            phase: phaseString,
            instancesTotal: rows.length,
            submittedTotal: submitted.length,
            submissionRate: rows.length > 0 ? submitted.length / rows.length : null,
            avgDurationMs: avg(durations),
        };
    });

    return NextResponse.json({
        ok: true,
        studies,
        selection: {studyId},
        mode: "study",
        study: {
            kpis: {
                studyId: study.id,
                key: study.key,
                name: study.name,
                participantsTotal,
                participantsCompleted,
                participantsInProgress,
                participantsNotStarted,
                completionRate,
                variantSplit: variantSplitRaw.map((r) => ({variant: r.assignedVariant, count: r._count._all})),
                sidePanelEnabledSplit: sidePanelSplitRaw.map((r) => ({
                    enabled: r.sidePanelEnabled,
                    count: r._count._all,
                })),
                avgTotalDurationMs,
            },
            taskSummaries,
            surveySummaries,
        },
    });
}
