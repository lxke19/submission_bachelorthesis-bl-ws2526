// app/modules/management/surveys/api.ts
//
// Purpose:
// - Client-side fetch helpers for the management wizard/list/detail pages.
// - Keeps UI components small and consistent.

import type {CreateStudyPayload} from "./types";

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string; issues?: unknown };

export async function listStudies(): Promise<
    ApiOk<{ studies: any[] }> | ApiErr
> {
    const res = await fetch("/api/management/surveys", {method: "GET"});
    return await res.json();
}

export async function createStudy(payload: CreateStudyPayload): Promise<
    ApiOk<{ study: { id: string; key: string; name: string } }> | ApiErr
> {
    const res = await fetch("/api/management/surveys", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
    });
    return await res.json();
}

export async function getStudy(studyId: string): Promise<
    ApiOk<{ study: any }> | ApiErr
> {
    const res = await fetch(`/api/management/surveys/${studyId}`, {method: "GET"});
    return await res.json();
}
