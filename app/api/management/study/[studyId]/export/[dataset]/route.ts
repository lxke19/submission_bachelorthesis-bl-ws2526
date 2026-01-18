// app/api/management/study/[studyId]/export/[dataset]/route.ts
import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireAuthenticatedUser} from "@/app/lib/auth";

/**
 * Management CSV Export Route
 * ---------------------------
 * Purpose:
 * - Serve analysis-ready CSV exports for a study (download).
 *
 * Cohorts (user requirement):
 * - all: include all participants in the study.
 * - completed: include only participants marked as completed by the app flow:
 *   status === COMPLETED OR currentStep === DONE
 *
 * Important constraints (user requirement):
 * - No additional strict/complete-case checks. "completed" is the single truth.
 * - CSV must always be safe for Excel/pandas/R:
 *   - Use comma delimiter.
 *   - Escape/quote values properly so user content cannot break CSV structure.
 *   - This is not optional (no toggles).
 */

type Dataset =
    | "participants_wide"
    | "task_sessions"
    | "survey_instances"
    | "survey_answers_long"
    | "access_logs"
    | "chat_messages"
    | "chat_turn_groups";

type Cohort = "all" | "completed";

const CSV_DELIMITER = ",";

function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = String(v);

    // CSV safety:
    // - Quote if delimiter, quotes, or line breaks are present.
    // - Escape quotes by doubling them (RFC 4180 compatible).
    const needsQuotes = s.includes(CSV_DELIMITER) || /["\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
}

function toIso(d: Date | null | undefined): string {
    return d ? d.toISOString() : "";
}

function safeMs(from: Date | null, to: Date | null): number | null {
    if (!from || !to) return null;
    const ms = to.getTime() - from.getTime();
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * Best-effort "task end" like in your dashboard/transcript logic.
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

function makeCsv(rows: Array<Record<string, unknown>>): string {
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const lines: string[] = [];
    lines.push(headers.map((h) => csvEscape(h)).join(CSV_DELIMITER));
    for (const r of rows) {
        lines.push(headers.map((h) => csvEscape((r as any)[h])).join(CSV_DELIMITER));
    }
    return lines.join("\n");
}

function isParticipantCompleted(p: { status: string; currentStep: string }): boolean {
    return p.status === "COMPLETED" || p.currentStep === "DONE";
}

function cohortAllowsParticipant(cohort: Cohort, p: { status: string; currentStep: string }): boolean {
    if (cohort === "all") return true;
    return isParticipantCompleted(p);
}

function pickTimelinessFromIndicators(indicators: any): {
    status: string;
    rationale: string;
    requestedRange: string;
    observedRange: string;
    missingBuckets: string;
} {
    // Best-effort extractor to survive schema tweaks.
    const tl = indicators?.timeliness ?? indicators?.TIMELINESS ?? indicators?.Timeliness ?? null;

    const status =
        String(
            tl?.status ??
            tl?.shortcode ??
            tl?.code ??
            tl?.label ??
            "",
        ) || "";

    const rationale =
        String(
            tl?.rationale ??
            tl?.explanation ??
            tl?.reason ??
            tl?.text ??
            "",
        ) || "";

    const requestedRange =
        String(
            tl?.requestedRange ??
            tl?.requested ??
            tl?.requested_window ??
            tl?.request ??
            "",
        ) || "";

    const observedRange =
        String(
            tl?.observedRange ??
            tl?.observed ??
            tl?.observed_window ??
            tl?.coverage ??
            "",
        ) || "";

    const missingBucketsRaw =
        tl?.missingBuckets ??
        tl?.missing_buckets ??
        tl?.missing ??
        tl?.gaps ??
        null;

    const missingBuckets =
        Array.isArray(missingBucketsRaw)
            ? missingBucketsRaw.join("|")
            : String(missingBucketsRaw ?? "");

    return {status, rationale, requestedRange, observedRange, missingBuckets};
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ studyId: string; dataset: string }> }) {
    const user = await requireAuthenticatedUser();
    if (!user) return NextResponse.json({ok: false, error: "Unauthorized"}, {status: 401});

    const {studyId, dataset: datasetRaw} = await ctx.params;
    const dataset = datasetRaw as Dataset;

    const url = new URL(req.url);
    const cohort = (url.searchParams.get("cohort") ?? "all") as Cohort;

    const study = await prisma.study.findUnique({where: {id: studyId}, select: {key: true, name: true}});
    if (!study) return NextResponse.json({ok: false, error: "Study not found"}, {status: 404});

    // ---- participants_wide ---------------------------------------------------
    if (dataset === "participants_wide") {
        const participants = await prisma.participant.findMany({
            where: {studyId},
            select: {
                id: true,
                accessCode: true,
                participantLabel: true,
                status: true,
                currentStep: true,
                currentTaskNumber: true,
                assignedVariant: true,
                sidePanelEnabled: true,
                reentryCount: true,
                startedAt: true,
                completedAt: true,
                lastActiveAt: true,
                createdAt: true,
            },
            orderBy: {createdAt: "asc"},
        });

        const rows = participants
            .filter((p) => cohortAllowsParticipant(cohort, p))
            .map((p) => {
                const completed = isParticipantCompleted(p);
                const totalDurationMs = safeMs(p.startedAt ?? null, p.completedAt ?? null);
                const totalDurationOutlier =
                    typeof totalDurationMs === "number" ? totalDurationMs > 3 * 60 * 60 * 1000 : false;

                return {
                    studyId,
                    participantId: p.id,
                    participantLabel: p.participantLabel ?? "",
                    accessCode: p.accessCode,
                    assignedVariant: p.assignedVariant,
                    sidePanelEnabled: p.sidePanelEnabled ? 1 : 0,
                    status: p.status,
                    currentStep: p.currentStep,
                    currentTaskNumber: p.currentTaskNumber ?? "",
                    reentryCount: p.reentryCount,
                    startedAt: toIso(p.startedAt ?? null),
                    completedAt: toIso(p.completedAt ?? null),
                    lastActiveAt: toIso(p.lastActiveAt ?? null),
                    totalDurationMs: totalDurationMs ?? "",
                    isCompletedStudy: completed ? 1 : 0,
                    totalDurationOutlier: totalDurationOutlier ? 1 : 0,
                };
            });

        const csv = makeCsv(rows);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "cache-control": "no-store",
                "content-disposition": `attachment; filename="${study.key}__participants_wide.csv"`,
            },
        });
    }

    // ---- task_sessions -------------------------------------------------------
    if (dataset === "task_sessions") {
        const sessions = await prisma.taskSession.findMany({
            where: {participant: {studyId}},
            select: {
                id: true,
                taskNumber: true,
                chatbotVariant: true,
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

                participant: {
                    select: {
                        id: true,
                        accessCode: true,
                        participantLabel: true,
                        assignedVariant: true,
                        sidePanelEnabled: true,
                        status: true,
                        currentStep: true,
                        completedAt: true,
                        lastActiveAt: true,
                    },
                },

                sidePanelSpans: {
                    where: {closedAt: null},
                    orderBy: {openedAt: "desc"},
                    take: 1,
                    select: {openedAt: true},
                },
            },
            orderBy: [{taskNumber: "asc"}],
        });

        const rows = sessions
            .filter((s) => cohortAllowsParticipant(cohort, s.participant))
            .map((s) => {
                const p = s.participant;

                const endChat = s.chatEndedAt ?? s.readyToAnswerAt;
                const chatDurationMs = safeMs(s.chatStartedAt ?? null, endChat ?? null);
                const postDurationMs = safeMs(s.postSurveyStartedAt ?? null, s.postSurveySubmittedAt ?? null);

                // effective side panel open ms (handles "left open"):
                let sidePanelOpenMsRawStr = "";
                try {
                    sidePanelOpenMsRawStr = String(s.sidePanelOpenMs);
                } catch {
                    sidePanelOpenMsRawStr = "";
                }

                const openSpan = Array.isArray((s as any).sidePanelSpans) && (s as any).sidePanelSpans.length > 0
                    ? (s as any).sidePanelSpans[0]
                    : null;

                const endAt = pickBestEffortTaskEndAt({
                    chatEndedAt: s.chatEndedAt ?? null,
                    readyToAnswerAt: s.readyToAnswerAt ?? null,
                    postSurveyStartedAt: s.postSurveyStartedAt ?? null,
                    postSurveySubmittedAt: s.postSurveySubmittedAt ?? null,
                    participantCompletedAt: p.completedAt ?? null,
                    participantLastActiveAt: p.lastActiveAt ?? null,
                });

                const extra = openSpan?.openedAt ? safeDeltaMs(openSpan.openedAt, endAt) : 0;

                let sidePanelOpenMsEffectiveStr = "";
                let sidePanelLeftOpenFlag = 0;
                try {
                    const raw = BigInt(s.sidePanelOpenMs);
                    const eff = raw + BigInt(Math.floor(extra));
                    sidePanelOpenMsEffectiveStr = String(eff);
                    sidePanelLeftOpenFlag = openSpan?.openedAt ? 1 : 0;
                } catch {
                    sidePanelOpenMsEffectiveStr = sidePanelOpenMsRawStr;
                }

                const chatDurationOutlier =
                    typeof chatDurationMs === "number" ? (chatDurationMs > 60 * 60 * 1000 ? 1 : 0) : 0;

                return {
                    studyId,
                    participantId: p.id,
                    participantLabel: p.participantLabel ?? "",
                    accessCode: p.accessCode,
                    assignedVariant: p.assignedVariant,
                    sidePanelEnabled: p.sidePanelEnabled ? 1 : 0,

                    taskSessionId: s.id,
                    taskNumber: s.taskNumber,
                    chatbotVariant: s.chatbotVariant,

                    chatStartedAt: toIso(s.chatStartedAt ?? null),
                    chatEndedAt: toIso(s.chatEndedAt ?? null),
                    readyToAnswerAt: toIso(s.readyToAnswerAt ?? null),
                    chatDurationMs: chatDurationMs ?? "",
                    chatDurationOutlier,

                    postSurveyStartedAt: toIso(s.postSurveyStartedAt ?? null),
                    postSurveySubmittedAt: toIso(s.postSurveySubmittedAt ?? null),
                    postSurveyDurationMs: postDurationMs ?? "",

                    userMessageCount: s.userMessageCount,
                    assistantMessageCount: s.assistantMessageCount,
                    chatRestartCount: s.chatRestartCount,

                    sidePanelOpenCount: s.sidePanelOpenCount,
                    sidePanelCloseCount: s.sidePanelCloseCount,
                    sidePanelOpenMsRaw: sidePanelOpenMsRawStr,
                    sidePanelOpenMsEffective: sidePanelOpenMsEffectiveStr,
                    sidePanelLeftOpenFlag,
                };
            });

        const csv = makeCsv(rows);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "cache-control": "no-store",
                "content-disposition": `attachment; filename="${study.key}__task_sessions.csv"`,
            },
        });
    }

    // ---- survey_instances ----------------------------------------------------
    if (dataset === "survey_instances") {
        const instances = await prisma.surveyInstance.findMany({
            where: {participant: {studyId}},
            select: {
                id: true,
                phase: true,
                taskSessionId: true,
                startedAt: true,
                submittedAt: true,
                surveyTemplate: {select: {key: true, name: true}},
                participant: {
                    select: {
                        id: true,
                        accessCode: true,
                        participantLabel: true,
                        assignedVariant: true,
                        sidePanelEnabled: true,
                        status: true,
                        currentStep: true,
                    },
                },
            },
            orderBy: [{startedAt: "asc"}],
        });

        const rows = instances
            .filter((si) => cohortAllowsParticipant(cohort, si.participant))
            .map((si) => {
                const p = si.participant;
                const durationMs = safeMs(si.startedAt, si.submittedAt ?? null);
                const isSubmitted = si.submittedAt ? 1 : 0;

                return {
                    studyId,
                    participantId: p.id,
                    participantLabel: p.participantLabel ?? "",
                    accessCode: p.accessCode,
                    assignedVariant: p.assignedVariant,
                    sidePanelEnabled: p.sidePanelEnabled ? 1 : 0,

                    surveyInstanceId: si.id,
                    phase: String(si.phase),
                    taskSessionId: si.taskSessionId ?? "",
                    templateKey: si.surveyTemplate.key,
                    templateName: si.surveyTemplate.name,

                    startedAt: toIso(si.startedAt),
                    submittedAt: toIso(si.submittedAt ?? null),
                    isSubmitted,
                    durationMs: durationMs ?? "",
                };
            });

        const csv = makeCsv(rows);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "cache-control": "no-store",
                "content-disposition": `attachment; filename="${study.key}__survey_instances.csv"`,
            },
        });
    }

    // ---- survey_answers_long -------------------------------------------------
    if (dataset === "survey_answers_long") {
        const answers = await prisma.surveyAnswer.findMany({
            where: {surveyInstance: {participant: {studyId}}},
            select: {
                id: true,
                createdAt: true,
                numericValue: true,
                textValue: true,
                selectedOption: {select: {value: true, label: true}},
                selectedOptions: {
                    select: {option: {select: {value: true, label: true, order: true}}},
                    orderBy: {option: {order: "asc"}},
                },
                question: {select: {id: true, key: true, text: true, type: true}},
                surveyInstance: {
                    select: {
                        id: true,
                        phase: true,
                        submittedAt: true,
                        participant: {
                            select: {
                                id: true,
                                accessCode: true,
                                participantLabel: true,
                                assignedVariant: true,
                                sidePanelEnabled: true,
                                status: true,
                                currentStep: true,
                            },
                        },
                    },
                },
            },
            orderBy: [{createdAt: "asc"}],
        });

        const rows = answers
            .filter((a) => cohortAllowsParticipant(cohort, a.surveyInstance.participant))
            .map((a) => {
                const p = a.surveyInstance.participant;
                const multiLabels = a.selectedOptions.map((x) => x.option.label).join("|");

                return {
                    studyId,
                    participantId: p.id,
                    participantLabel: p.participantLabel ?? "",
                    accessCode: p.accessCode,
                    assignedVariant: p.assignedVariant,
                    sidePanelEnabled: p.sidePanelEnabled ? 1 : 0,

                    surveyInstanceId: a.surveyInstance.id,
                    phase: String(a.surveyInstance.phase),
                    surveySubmittedAt: toIso(a.surveyInstance.submittedAt ?? null),

                    answerId: a.id,
                    answerCreatedAt: toIso(a.createdAt),

                    questionId: a.question.id,
                    questionKey: a.question.key,
                    questionType: a.question.type,
                    questionText: a.question.text,

                    numericValue: a.numericValue ?? "",
                    singleChoiceValue: a.selectedOption?.value ?? "",
                    singleChoiceLabel: a.selectedOption?.label ?? "",
                    multiChoiceLabels: multiLabels,
                    textValue: a.textValue ?? "",
                };
            });

        const csv = makeCsv(rows);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "cache-control": "no-store",
                "content-disposition": `attachment; filename="${study.key}__survey_answers_long.csv"`,
            },
        });
    }

    // ---- access_logs (optional) ----------------------------------------------
    if (dataset === "access_logs") {
        const logs = await prisma.participantAccessLog.findMany({
            where: {participant: {studyId}},
            select: {
                id: true,
                enteredAt: true,
                userAgent: true,
                participant: {
                    select: {
                        id: true,
                        accessCode: true,
                        participantLabel: true,
                        assignedVariant: true,
                        status: true,
                        currentStep: true,
                    },
                },
            },
            orderBy: [{enteredAt: "asc"}],
        });

        const rows = logs
            .filter((l) => cohortAllowsParticipant(cohort, l.participant))
            .map((l) => ({
                studyId,
                participantId: l.participant.id,
                participantLabel: l.participant.participantLabel ?? "",
                accessCode: l.participant.accessCode,
                assignedVariant: l.participant.assignedVariant,
                accessLogId: l.id,
                enteredAt: toIso(l.enteredAt),
                userAgent: l.userAgent ?? "",
            }));

        const csv = makeCsv(rows);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "cache-control": "no-store",
                "content-disposition": `attachment; filename="${study.key}__access_logs.csv"`,
            },
        });
    }

    // ---- chat_turn_groups ----------------------------------------------------
    if (dataset === "chat_turn_groups") {
        const messages = await prisma.chatMessage.findMany({
            where: {chatThread: {taskSession: {participant: {studyId}}}},
            select: {
                id: true,
                role: true,
                content: true,
                sequence: true,
                replyToSequence: true,
                createdAt: true,
                chatThread: {
                    select: {
                        id: true,
                        langGraphThreadId: true,
                        restartIndex: true,
                        createdAt: true,
                        taskSession: {
                            select: {
                                id: true,
                                taskNumber: true,
                                participant: {
                                    select: {
                                        id: true,
                                        accessCode: true,
                                        participantLabel: true,
                                        assignedVariant: true,
                                        sidePanelEnabled: true,
                                        status: true,
                                        currentStep: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: [{createdAt: "asc"}],
        });

        const filtered = messages.filter((m) => cohortAllowsParticipant(cohort, m.chatThread.taskSession.participant));

        // Sort deterministically in JS:
        // participantLabel -> taskNumber -> restartIndex -> createdAt -> sequence
        const sorted = filtered.slice().sort((a, b) => {
            const pa = a.chatThread.taskSession.participant.participantLabel ?? "";
            const pb = b.chatThread.taskSession.participant.participantLabel ?? "";
            if (pa < pb) return -1;
            if (pa > pb) return 1;

            const ta = a.chatThread.taskSession.taskNumber;
            const tb = b.chatThread.taskSession.taskNumber;
            if (ta !== tb) return ta - tb;

            const ra = a.chatThread.restartIndex;
            const rb = b.chatThread.restartIndex;
            if (ra !== rb) return ra - rb;

            const da = a.createdAt.getTime();
            const db = b.createdAt.getTime();
            if (da !== db) return da - db;

            return a.sequence - b.sequence;
        });

        // Fetch DQ logs for all relevant threads
        const threadIds = Array.from(new Set(sorted.map((m) => m.chatThread.langGraphThreadId)));

        const dqLogs = await prisma.threadDataQualityLog.findMany({
            where: {langGraphThreadId: {in: threadIds}},
            select: {
                id: true,
                langGraphThreadId: true,
                createdAt: true,
                indicators: true,
            },
            orderBy: [{createdAt: "asc"}],
        });

        const dqByThread = new Map<string, Array<{ createdAt: Date; indicators: any }>>();
        for (const d of dqLogs) {
            const arr = dqByThread.get(d.langGraphThreadId) ?? [];
            arr.push({createdAt: d.createdAt, indicators: d.indicators});
            dqByThread.set(d.langGraphThreadId, arr);
        }

        // Group messages into "user turns":
        // USER message -> timeliness (best effort) -> all assistant messages until next USER.
        type GroupRow = Record<string, unknown>;
        const rows: GroupRow[] = [];

        // We iterate per (threadId) to keep window logic simple.
        const messagesByThread = new Map<string, typeof sorted>();
        for (const m of sorted) {
            const key = m.chatThread.id; // internal chatThread UUID
            const arr = messagesByThread.get(key) ?? [];
            arr.push(m);
            messagesByThread.set(key, arr);
        }

        for (const [, threadMsgs] of messagesByThread) {
            // Ensure intra-thread order:
            threadMsgs.sort((a, b) => {
                const da = a.createdAt.getTime();
                const db = b.createdAt.getTime();
                if (da !== db) return da - db;
                return a.sequence - b.sequence;
            });

            const thread = threadMsgs[0]?.chatThread;
            if (!thread) continue;

            const p = thread.taskSession.participant;

            // turn counter per thread
            let userTurnIndex = 0;

            for (let i = 0; i < threadMsgs.length; i++) {
                const msg = threadMsgs[i];
                if (msg.role !== "USER") continue;

                userTurnIndex += 1;

                // Find next USER message to close the window
                let nextUserAt: Date | null = null;
                for (let j = i + 1; j < threadMsgs.length; j++) {
                    if (threadMsgs[j].role === "USER") {
                        nextUserAt = threadMsgs[j].createdAt;
                        break;
                    }
                }

                // Collect assistant messages until next user
                const assistantParts: string[] = [];
                const assistantMsgIds: string[] = [];
                const assistantMsgSeqs: number[] = [];
                let assistantFirstAt: Date | null = null;
                let assistantLastAt: Date | null = null;

                for (let k = i + 1; k < threadMsgs.length; k++) {
                    const m2 = threadMsgs[k];
                    if (m2.role === "USER") break;
                    if (m2.role !== "ASSISTANT") continue;

                    assistantParts.push(m2.content);
                    assistantMsgIds.push(m2.id);
                    assistantMsgSeqs.push(m2.sequence);

                    assistantFirstAt = assistantFirstAt ?? m2.createdAt;
                    assistantLastAt = m2.createdAt;
                }

                // Best-effort: pick latest DQ log within [user.createdAt, nextUserAt)
                const dqArr = dqByThread.get(thread.langGraphThreadId) ?? [];
                let bestDq: { createdAt: Date; indicators: any } | null = null;

                for (const d of dqArr) {
                    const t = d.createdAt.getTime();
                    const start = msg.createdAt.getTime();
                    const end = nextUserAt ? nextUserAt.getTime() : Number.POSITIVE_INFINITY;

                    if (t >= start && t < end) bestDq = d;
                }

                const tl = bestDq ? pickTimelinessFromIndicators(bestDq.indicators) : {
                    status: "",
                    rationale: "",
                    requestedRange: "",
                    observedRange: "",
                    missingBuckets: "",
                };

                const assistantCombined = assistantParts.join("\n\n---\n\n");

                rows.push({
                    studyId,
                    participantId: p.id,
                    participantLabel: p.participantLabel ?? "",
                    accessCode: p.accessCode,
                    assignedVariant: p.assignedVariant,
                    sidePanelEnabled: p.sidePanelEnabled ? 1 : 0,

                    taskNumber: thread.taskSession.taskNumber,
                    taskSessionId: thread.taskSession.id,

                    chatThreadId: thread.id,
                    langGraphThreadId: thread.langGraphThreadId,
                    restartIndex: thread.restartIndex,

                    userTurnIndex,

                    userMessageId: msg.id,
                    userMessageSeq: msg.sequence,
                    userMessageAt: toIso(msg.createdAt),
                    userInput: msg.content,

                    timelinessLogAt: bestDq ? toIso(bestDq.createdAt) : "",
                    timelinessStatus: tl.status,
                    timelinessRationale: tl.rationale,
                    timelinessRequestedRange: tl.requestedRange,
                    timelinessObservedRange: tl.observedRange,
                    timelinessMissingBuckets: tl.missingBuckets,

                    assistantMessageCount: assistantMsgIds.length,
                    assistantFirstAt: toIso(assistantFirstAt),
                    assistantLastAt: toIso(assistantLastAt),
                    assistantMessageIds: assistantMsgIds.join("|"),
                    assistantMessageSeqs: assistantMsgSeqs.join("|"),
                    assistantOutput: assistantCombined,
                });
            }
        }

        // Final global sort: participantLabel -> taskNumber -> restartIndex -> userTurnIndex
        rows.sort((a, b) => {
            const pa = String(a.participantLabel ?? "");
            const pb = String(b.participantLabel ?? "");
            if (pa < pb) return -1;
            if (pa > pb) return 1;

            const ta = Number(a.taskNumber ?? 0);
            const tb = Number(b.taskNumber ?? 0);
            if (ta !== tb) return ta - tb;

            const ra = Number(a.restartIndex ?? 0);
            const rb = Number(b.restartIndex ?? 0);
            if (ra !== rb) return ra - rb;

            const ua = Number(a.userTurnIndex ?? 0);
            const ub = Number(b.userTurnIndex ?? 0);
            return ua - ub;
        });

        const csv = makeCsv(rows);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "cache-control": "no-store",
                "content-disposition": `attachment; filename="${study.key}__chat_turn_groups.csv"`,
            },
        });
    }

    // chat_messages optional (not implemented here to keep payload sane)
    if (dataset === "chat_messages") {
        return NextResponse.json({ok: false, error: "chat_messages not implemented (would be huge)"}, {status: 400});
    }

    return NextResponse.json({ok: false, error: `Unknown dataset: ${datasetRaw}`}, {status: 400});
}
