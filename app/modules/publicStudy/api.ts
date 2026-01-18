// app/modules/publicStudy/api.ts
//
// Purpose:
// - Client-side helper functions for the public study flow.
// - Keeps fetch logic centralized and typed.
//
// Why:
// - You want modular files (not huge page.tsx).
// - Study pages should be thin, and real logic belongs in modules.

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string; redirectTo?: string; details?: unknown };

export type StartSessionResult =
    | ApiOk<{
    token: string;
    accessCode: string;
    redirectTo: string; // usually /study/[code]/resume or /done
}>
    | ApiErr;

export async function startStudySession(body: {
    accessCode: string;
    clientMeta?: unknown;
}): Promise<StartSessionResult> {
    const res = await fetch("/api/study/session/start", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return {ok: false, error: "Request failed."};
    return json as StartSessionResult;
}

export type ResumeResult =
    | ApiOk<{ redirectTo: string }>
    | ApiErr;

export async function resumeStudy(token: string): Promise<ResumeResult> {
    const res = await fetch("/api/study/resume", {
        method: "GET",
        headers: {Authorization: `Bearer ${token}`},
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return {ok: false, error: "Request failed."};
    return json as ResumeResult;
}

export type SurveyQuestion = {
    id: string;
    key: string;
    text: string;
    type: "SINGLE_CHOICE" | "MULTI_CHOICE" | "SCALE_NRS" | "TEXT";
    required: boolean;
    order: number;
    scaleMin: number | null;
    scaleMax: number | null;
    scaleStep: number | null;
    options: { id: string; value: string; label: string; order: number }[];
};

export type SurveyLoadResult =
    | ApiOk<{
    phase: "PRE" | "FINAL" | "TASK1_POST" | "TASK2_POST" | "TASK3_POST";
    title: string;
    questions: SurveyQuestion[];
}>
    | ApiErr;

export async function loadSurvey(token: string, path: string): Promise<SurveyLoadResult> {
    const res = await fetch(path, {
        method: "GET",
        headers: {Authorization: `Bearer ${token}`},
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return {ok: false, error: "Request failed."};
    return json as SurveyLoadResult;
}

export type SubmitSurveyAnswer =
    | { questionId: string; type: "SCALE_NRS"; numericValue: number }
    | { questionId: string; type: "SINGLE_CHOICE"; selectedOptionId: string }
    | { questionId: string; type: "MULTI_CHOICE"; selectedOptionIds: string[] }
    | { questionId: string; type: "TEXT"; textValue: string };

export type SubmitSurveyResult =
    | ApiOk<{ redirectTo: string }>
    | ApiErr;

export async function submitSurvey(token: string, path: string, body: { answers: SubmitSurveyAnswer[] }) {
    const res = await fetch(path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return {ok: false, error: "Request failed."} as SubmitSurveyResult;
    return json as SubmitSurveyResult;
}

export type TaskLoadResult =
    | ApiOk<{
    taskNumber: 1 | 2 | 3;
    title: string;
    promptMarkdown: string;
    // What: The LangGraph thread_id that should be used for checkpointing.
    // Why: You want stable thread_id per ChatThread record (per task session).
    langGraphThreadId: string;
    sidePanelEnabled: boolean;
}>
    | ApiErr;

export async function loadTask(token: string, taskNumber: string): Promise<TaskLoadResult> {
    const res = await fetch(`/api/study/task/${taskNumber}`, {
        method: "GET",
        headers: {Authorization: `Bearer ${token}`},
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return {ok: false, error: "Request failed."};
    return json as TaskLoadResult;
}

export type ReadyResult =
    | ApiOk<{ redirectTo: string }>
    | ApiErr;

export async function markReadyToAnswer(token: string, taskNumber: string): Promise<ReadyResult> {
    const res = await fetch(`/api/study/task/${taskNumber}/ready`, {
        method: "POST",
        headers: {Authorization: `Bearer ${token}`},
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return {ok: false, error: "Request failed."};
    return json as ReadyResult;
}
