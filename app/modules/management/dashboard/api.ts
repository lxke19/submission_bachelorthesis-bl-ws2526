// app/modules/management/dashboard/api.ts
//
// Purpose:
// - Client-side fetch helpers for the Management Overview dashboard.
// - Centralizes fetch logic and keeps UI components small.

import type {OverviewResponse} from "./types";

export async function loadOverview(studyId: string | null): Promise<OverviewResponse> {
    const qs = new URLSearchParams();
    if (studyId) qs.set("studyId", studyId);

    const res = await fetch(`/api/management/dashboard?${qs.toString()}`, {
        method: "GET",
        headers: {"content-type": "application/json"},
        cache: "no-store",
    });

    return (await res.json()) as unknown as OverviewResponse;
}

export type ParticipantsListItem = {
    id: string;
    accessCode: string;
    participantLabel: string | null;
    status: string;
    currentStep: string;
    currentTaskNumber: number | null;
    startedAt: string | null;
    completedAt: string | null;
    lastActiveAt: string | null;
    assignedVariant: string;
    sidePanelEnabled: boolean;
};

export async function loadStudyParticipants(studyId: string): Promise<
    { ok: true; participants: ParticipantsListItem[] } | { ok: false; error: string }
> {
    const res = await fetch(`/api/management/study/${studyId}/participants`, {
        method: "GET",
        headers: {"content-type": "application/json"},
        cache: "no-store",
    });

    return (await res.json()) as unknown as { ok: true; participants: ParticipantsListItem[] } | {
        ok: false;
        error: string
    };
}

export type TranscriptMessage = {
    id: string;
    role: string;
    content: string;
    sequence: number;
    createdAt: string;
};

export type TranscriptThread = {
    id: string;
    langGraphThreadId: string;
    status: string;
    closeReason: string | null;
    restartIndex: number;
    createdAt: string;
    closedAt: string | null;
    messages: TranscriptMessage[];
};

export type TranscriptTaskSession = {
    id: string;
    taskNumber: number;
    startedAt: string; // TaskSession.startedAt
    chatStartedAt: string | null;
    chatEndedAt: string | null;
    readyToAnswerAt: string | null;
    postSurveyStartedAt: string | null;
    postSurveySubmittedAt: string | null;
    userMessageCount: number;
    assistantMessageCount: number;
    chatRestartCount: number;
    sidePanelOpenCount: number;
    sidePanelCloseCount: number;
    sidePanelOpenMs: string; // BigInt serialized
    threads: TranscriptThread[];
};

export type TranscriptSurveyAnswer = {
    id: string;
    createdAt: string;
    question: {
        id: string;
        key: string;
        text: string;
        type: string;
        order: number;
        required: boolean;
        scaleMin: number | null;
        scaleMax: number | null;
        scaleStep: number | null;
    };
    value: string | number | string[] | null;
    raw: {
        numericValue: number | null;
        textValue: string | null;
        selectedOption: { id: string; value: string; label: string } | null;
        selectedOptions: Array<{ id: string; value: string; label: string; order: number }>;
    };
};

export type TranscriptSurveyInstance = {
    id: string;
    phase: string;
    taskSessionId: string | null;
    startedAt: string;
    submittedAt: string | null;
    template: {
        id: string;
        key: string;
        name: string;
    };
    answers: TranscriptSurveyAnswer[];
};

export async function loadParticipantTranscript(participantId: string): Promise<
    {
        ok: true;
        participant: {
            id: string;
            accessCode: string;
            participantLabel: string | null;
            status: string;
            currentStep: string;
            currentTaskNumber: number | null;
            startedAt: string | null;
            completedAt: string | null;
            lastActiveAt: string | null;
            createdAt: string;
            updatedAt: string;
        };
        surveys: TranscriptSurveyInstance[];
        sessions: TranscriptTaskSession[]
    }
    | { ok: false; error: string }
> {
    const res = await fetch(`/api/management/participant/${participantId}/transcript`, {
        method: "GET",
        headers: {"content-type": "application/json"},
        cache: "no-store",
    });

    return (await res.json()) as unknown as
        | {
        ok: true;
        participant: {
            id: string;
            accessCode: string;
            participantLabel: string | null;
            status: string;
            currentStep: string;
            currentTaskNumber: number | null;
            startedAt: string | null;
            completedAt: string | null;
            lastActiveAt: string | null;
            createdAt: string;
            updatedAt: string;
        };
        surveys: TranscriptSurveyInstance[];
        sessions: TranscriptTaskSession[];
    }
        | { ok: false; error: string };
}

export type SurveyAnalyticsQuestionRow =
    | {
    questionId: string;
    key: string;
    text: string;
    type: "SCALE_NRS";
    required: boolean;
    n: number;
    mean: number | null;
    min: number | null;
    max: number | null;
}
    | {
    questionId: string;
    key: string;
    text: string;
    type: "SINGLE_CHOICE" | "MULTI_CHOICE";
    required: boolean;
    n: number;
    options: Array<{ optionId: string; value: string; label: string; count: number }>;
}
    | {
    questionId: string;
    key: string;
    text: string;
    type: "TEXT";
    required: boolean;
    n: number;
    nonEmpty: number;
};

export type SurveyAnalyticsPhaseBlock = {
    phase: string;
    templateKey: string | null;
    templateName: string | null;
    submittedTotal: number;
    questions: SurveyAnalyticsQuestionRow[];
};

export async function loadSurveyAnalytics(studyId: string): Promise<
    { ok: true; phases: SurveyAnalyticsPhaseBlock[] } | { ok: false; error: string }
> {
    const res = await fetch(`/api/management/study/${studyId}/survey-analytics`, {
        method: "GET",
        headers: {"content-type": "application/json"},
        cache: "no-store",
    });

    return (await res.json()) as unknown as { ok: true; phases: SurveyAnalyticsPhaseBlock[] } | {
        ok: false;
        error: string
    };
}

export type SurveyQuestionAnswerRow =
    | { participantLabel: string | null; accessCode: string; submittedAt: string | null; value: string }
    | { participantLabel: string | null; accessCode: string; submittedAt: string | null; value: number | null }
    | { participantLabel: string | null; accessCode: string; submittedAt: string | null; value: string[] };

export async function loadSurveyQuestionAnswers(args: {
    studyId: string;
    questionId: string;
    phase: string;
}): Promise<{ ok: true; rows: SurveyQuestionAnswerRow[] } | { ok: false; error: string }> {
    const qs = new URLSearchParams();
    qs.set("phase", args.phase);

    const res = await fetch(
        `/api/management/study/${args.studyId}/survey-question/${args.questionId}/answers?${qs.toString()}`,
        {
            method: "GET",
            headers: {"content-type": "application/json"},
            cache: "no-store",
        },
    );

    return (await res.json()) as unknown as { ok: true; rows: SurveyQuestionAnswerRow[] } | {
        ok: false;
        error: string
    };
}
