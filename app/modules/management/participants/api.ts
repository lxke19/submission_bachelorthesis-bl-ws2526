// app/modules/management/participants/api.ts
//
// Purpose:
// - Client-side helper functions for the management participants UI.
// - Keeps fetch logic centralized and typed.

export type StudyListItem = { id: string; key: string; name: string };

export type CreateParticipantBody = {
    studyId: string;
    assignedVariant: "VARIANT_1" | "VARIANT_2";
    participantLabel?: string;
};

export type CreateParticipantResult =
    | {
    ok: true;
    participant: {
        id: string;
        accessCode: string;
        participantLabel: string | null;
        assignedVariant: "VARIANT_1" | "VARIANT_2";
        sidePanelEnabled: boolean;
        status: string;
        currentStep: string;
        createdAt: string;
        study: { id: string; key: string; name: string };
    };
}
    | { ok: false; error: string; details?: unknown };

export async function createParticipant(body: CreateParticipantBody): Promise<CreateParticipantResult> {
    const res = await fetch("/api/management/participants", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
        return {ok: false, error: "Request failed."};
    }

    return data as CreateParticipantResult;
}
