// app/api/management/participant/[participantId]/transcript/route.ts
//
// Purpose:
// - Admin-only: fetch full chat transcript per participant across all tasks.
// - Includes: TaskSession -> ChatThreads -> ChatMessages (ordered by sequence).
//
// Notes:
// - Append-only transcript: we only read and render.
// - BigInt fields are serialized to string to be JSON safe.
//
// EXTENSION (Timeline completeness):
// - Also returns participant-level timing (startedAt/completedAt/lastActiveAt)
// - Also returns ALL SurveyInstances for this participant (PRE, TASKn_POST, FINAL),
//   including survey duration (startedAt -> submittedAt) and answers (human-readable).
//
// Why:
// - Management UI should be able to render a complete A->Z flow with durations and outputs,
//   without adding DB schema or extra endpoints.

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireAuthenticatedUser} from "@/app/lib/auth";

type HumanReadableAnswerValue = string | number | string[] | null;

/**
 * Side Panel Duration (Management view)
 * ====================================
 *
 * Problem:
 * - If the user opens the side panel and never sends a close event (e.g. leaves it open until task ends),
 *   TaskSession.sidePanelOpenMs stays at 0 even though sidePanelOpenCount > 0.
 *
 * Desired interpretation (your rule):
 * - If Opens > Closes (i.e. there is an open SidePanelSpan with closedAt=null),
 *   we treat the panel as "open until the end of the task/session".
 *
 * Implementation (read-time only; does NOT mutate DB):
 * - effectiveOpenMs = storedOpenMs + (endAt - openSpan.openedAt) for the latest open span.
 * - endAt is chosen as a best-effort "task end" timestamp (chatEndedAt/readyToAnswerAt/.../lastActiveAt/now).
 *
 * We keep the original stored value as sidePanelOpenMsRaw for audit/debug, but return sidePanelOpenMs
 * as the effective value so existing UI calculations instantly become correct without UI changes.
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ participantId: string }> }) {
    const user = await requireAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ok: false, error: "Unauthorized"}, {status: 401});
    }

    const {participantId} = await ctx.params;

    const participant = await prisma.participant.findUnique({
        where: {id: participantId},
        select: {
            id: true,
            accessCode: true,
            participantLabel: true,
            status: true,
            currentStep: true,
            currentTaskNumber: true,
            startedAt: true,
            completedAt: true,
            lastActiveAt: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!participant) {
        return NextResponse.json({ok: false, error: "Participant not found"}, {status: 404});
    }

    const sessions = await prisma.taskSession.findMany({
        where: {participantId},
        orderBy: [{taskNumber: "asc"}],
        select: {
            id: true,
            taskNumber: true,
            chatStartedAt: true,
            chatEndedAt: true,
            readyToAnswerAt: true,
            postSurveyStartedAt: true,
            postSurveySubmittedAt: true,
            startedAt: true,
            userMessageCount: true,
            assistantMessageCount: true,
            chatRestartCount: true,
            sidePanelOpenCount: true,
            sidePanelCloseCount: true,
            sidePanelOpenMs: true,

            // NEW (read-time only): detect "open left open" spans
            sidePanelSpans: {
                where: {closedAt: null},
                orderBy: {openedAt: "desc"},
                take: 1,
                select: {
                    openedAt: true,
                },
            },

            chatThreads: {
                orderBy: [{restartIndex: "asc"}],
                select: {
                    id: true,
                    langGraphThreadId: true,
                    status: true,
                    closeReason: true,
                    restartIndex: true,
                    createdAt: true,
                    closedAt: true,
                    messages: {
                        orderBy: [{sequence: "asc"}],
                        select: {
                            id: true,
                            role: true,
                            content: true,
                            sequence: true,
                            createdAt: true,
                        },
                    },
                },
            },
        },
    });

    // Survey timeline (PRE, TASKn_POST, FINAL) including answers.
    // We fetch all instances (submitted and not submitted) so the UI can show
    // drafts and missing submissions explicitly.
    const surveyInstances = await prisma.surveyInstance.findMany({
        where: {participantId},
        orderBy: [{startedAt: "asc"}],
        select: {
            id: true,
            phase: true,
            startedAt: true,
            submittedAt: true,
            taskSessionId: true,
            surveyTemplate: {
                select: {id: true, key: true, name: true},
            },
            answers: {
                orderBy: [{createdAt: "asc"}],
                select: {
                    id: true,
                    createdAt: true,
                    numericValue: true,
                    textValue: true,
                    selectedOption: {select: {id: true, value: true, label: true}},
                    selectedOptions: {
                        select: {
                            option: {select: {id: true, value: true, label: true, order: true}},
                        },
                        orderBy: {option: {order: "asc"}},
                    },
                    question: {
                        select: {
                            id: true,
                            key: true,
                            text: true,
                            type: true,
                            order: true,
                            required: true,
                            scaleMin: true,
                            scaleMax: true,
                            scaleStep: true,
                        },
                    },
                },
            },
        },
    });

    // Normalize answers: keep them in question.order order for nicer UI.
    const surveys = surveyInstances.map((si) => {
        const answersSorted = [...si.answers].sort((a, b) => (a.question.order ?? 0) - (b.question.order ?? 0));

        const answers = answersSorted.map((a) => {
            // Human-readable value
            let value: HumanReadableAnswerValue;

            if (a.question.type === "SCALE_NRS") {
                value = typeof a.numericValue === "number" ? a.numericValue : null;
            } else if (a.question.type === "TEXT") {
                value = a.textValue ?? "";
            } else if (a.question.type === "SINGLE_CHOICE") {
                value = a.selectedOption?.label ?? "";
            } else {
                // MULTI_CHOICE
                value = a.selectedOptions.map((x) => x.option.label);
            }

            return {
                id: a.id,
                createdAt: a.createdAt.toISOString(),
                question: {
                    id: a.question.id,
                    key: a.question.key,
                    text: a.question.text,
                    type: a.question.type,
                    order: a.question.order,
                    required: a.question.required,
                    scaleMin: a.question.scaleMin,
                    scaleMax: a.question.scaleMax,
                    scaleStep: a.question.scaleStep,
                },
                value,
                // Keep raw identifiers if you ever need audit/debug:
                raw: {
                    numericValue: a.numericValue ?? null,
                    textValue: a.textValue ?? null,
                    selectedOption: a.selectedOption
                        ? {id: a.selectedOption.id, value: a.selectedOption.value, label: a.selectedOption.label}
                        : null,
                    selectedOptions: a.selectedOptions.map((x) => ({
                        id: x.option.id,
                        value: x.option.value,
                        label: x.option.label,
                        order: x.option.order,
                    })),
                },
            };
        });

        return {
            id: si.id,
            phase: si.phase,
            taskSessionId: si.taskSessionId ?? null,
            startedAt: si.startedAt.toISOString(),
            submittedAt: si.submittedAt ? si.submittedAt.toISOString() : null,
            template: {
                id: si.surveyTemplate.id,
                key: si.surveyTemplate.key,
                name: si.surveyTemplate.name,
            },
            answers,
        };
    });

    return NextResponse.json({
        ok: true,
        participant: {
            ...participant,
            startedAt: participant.startedAt ? participant.startedAt.toISOString() : null,
            completedAt: participant.completedAt ? participant.completedAt.toISOString() : null,
            lastActiveAt: participant.lastActiveAt ? participant.lastActiveAt.toISOString() : null,
            createdAt: participant.createdAt.toISOString(),
            updatedAt: participant.updatedAt.toISOString(),
        },
        surveys,
        sessions: sessions.map((s) => {
            // Effective side panel open time (read-time only)
            const endAt = pickBestEffortTaskEndAt({
                chatEndedAt: s.chatEndedAt ?? null,
                readyToAnswerAt: s.readyToAnswerAt ?? null,
                postSurveyStartedAt: s.postSurveyStartedAt ?? null,
                postSurveySubmittedAt: s.postSurveySubmittedAt ?? null,
                participantCompletedAt: participant.completedAt ?? null,
                participantLastActiveAt: participant.lastActiveAt ?? null,
            });

            const openSpan = Array.isArray((s as any).sidePanelSpans) && (s as any).sidePanelSpans.length > 0
                ? (s as any).sidePanelSpans[0]
                : null;

            const extraMs = openSpan?.openedAt ? safeDeltaMs(openSpan.openedAt, endAt) : 0;

            // stored is BigInt; keep raw for audit/debug and return effective in the existing field name
            const storedRaw = s.sidePanelOpenMs;
            const effective = storedRaw + BigInt(Math.floor(extraMs));

            return ({
                ...s,
                startedAt: s.startedAt.toISOString(),
                chatStartedAt: s.chatStartedAt ? s.chatStartedAt.toISOString() : null,
                chatEndedAt: s.chatEndedAt ? s.chatEndedAt.toISOString() : null,
                readyToAnswerAt: s.readyToAnswerAt ? s.readyToAnswerAt.toISOString() : null,
                postSurveyStartedAt: s.postSurveyStartedAt ? s.postSurveyStartedAt.toISOString() : null,
                postSurveySubmittedAt: s.postSurveySubmittedAt ? s.postSurveySubmittedAt.toISOString() : null,

                // Keep both:
                sidePanelOpenMsRaw: String(storedRaw),
                sidePanelOpenMs: String(effective),

                threads: s.chatThreads.map((t) => ({
                    ...t,
                    createdAt: t.createdAt.toISOString(),
                    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
                    messages: t.messages.map((m) => ({
                        ...m,
                        createdAt: m.createdAt.toISOString(),
                    })),
                })),
            });
        }),
    });
}
