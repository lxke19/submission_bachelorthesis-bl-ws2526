// app/modules/management/dashboard/types.ts
//
// Purpose:
// - Shared types for the Management Overview dashboard (client + API payloads).
// - Keep payloads stable so UI can evolve without refactoring every time.
//
// Notes:
// - All fields are null-safe because the DB might contain no data yet.
// - We split heavy details (participant transcript, raw answers) into separate endpoints.

export type StudyListItem = {
    id: string;
    key: string;
    name: string;
};

export type OverviewSelection = {
    studyId: string | null; // null => All Studies
};

export type GlobalKpis = {
    studiesTotal: number;
    participantsTotal: number;
    participantsCompleted: number;
    participantsInProgress: number;
    participantsNotStarted: number;
    completionRate: number | null; // 0..1, null if participantsTotal=0
    avgTotalDurationMs: number | null; // completed only
};

export type StudyBreakdownRow = {
    studyId: string;
    key: string;
    name: string;
    participantsTotal: number;
    participantsCompleted: number;
    participantsInProgress: number;
    participantsNotStarted: number;
    completionRate: number | null;
    avgTotalDurationMs: number | null;
};

export type StudyKpis = {
    studyId: string;
    key: string;
    name: string;

    participantsTotal: number;
    participantsCompleted: number;
    participantsInProgress: number;
    participantsNotStarted: number;
    completionRate: number | null;

    variantSplit: Array<{ variant: string; count: number }>;
    sidePanelEnabledSplit: Array<{ enabled: boolean; count: number }>;

    avgTotalDurationMs: number | null; // completed only
};

export type TaskSummary = {
    taskNumber: number;

    sessionsTotal: number;
    readyToAnswerCount: number;
    hasChattedAtLeastOnceCount: number;

    avgChatDurationMs: number | null; // chatStartedAt -> (chatEndedAt||readyToAnswerAt)
    avgUserMessages: number | null;
    avgAssistantMessages: number | null;

    avgSidePanelOpenMs: number | null;
    sidePanelOpenCountTotal: number;

    // EXTENSION (present in dashboard route payload):
    // - Post-survey summary on TaskSession level
    postSurveyStartedCount: number;
    postSurveySubmittedCount: number;
    postSurveySubmissionRate: number | null;
    avgPostSurveyDurationMs: number | null;

    // EXTENSION (for chat threads):
    avgRestarts: number | null;
};

export type SurveyPhaseSummary = {
    phase: string;
    instancesTotal: number;
    submittedTotal: number;
    submissionRate: number | null;
    avgDurationMs: number | null; // startedAt -> submittedAt
};

export type OverviewResponse =
    | {
    ok: true;
    studies: StudyListItem[];
    selection: OverviewSelection;
    mode: "all";
    global: {
        kpis: GlobalKpis;
        breakdown: StudyBreakdownRow[];
    };
}
    | {
    ok: true;
    studies: StudyListItem[];
    selection: OverviewSelection;
    mode: "study";
    study: {
        kpis: StudyKpis;
        taskSummaries: TaskSummary[];
        surveySummaries: SurveyPhaseSummary[];
    };
}
    | {
    ok: false;
    error: string;
};
