// app/modules/publicStudy/session-token.ts
//
// Purpose:
// - Create/verify a signed session token for the public study flow.
// - Token is stored ONLY in memory on the client (React Context).
//
// Why:
// - We need an authentication mechanism for /api/study/* that does NOT use cookies/localStorage,
//   because you want reload => token disappears => user is forced back to /study.
//
// Security model:
// - Token is a compact JWT-like string signed with HMAC-SHA256 (AUTH_SECRET).
// - Server verifies signature + exp + accessCode match.
// - Client keeps token only in memory; no persistence.
//
// Variant / Study policy (IMPORTANT):
// - Participants can be assigned to different variants.
// - The decisive flag is Participant.sidePanelEnabled.
// - The UI must be able to decide this purely client-side without an extra API call.
// - Therefore we include `sidePanelEnabled` as a signed claim in the token payload.
// - If the claim is missing (older tokens), the UI should default to "disabled" for safety.

import crypto from "node:crypto";

type StudyTokenPayload = {
    // What: participantId.
    // Why: stable server-side lookup without trusting accessCode alone.
    sub: string;

    // What: access code the user typed.
    // Why: we bind token to this code to prevent cross-use.
    accessCode: string;

    // What: issued-at (seconds).
    // Why: audit + expiry evaluation.
    iat: number;

    // What: expiry (seconds).
    // Why: prevent tokens from living forever.
    exp: number;

    // What: whether the participant is allowed to see the Data Insights side panel.
    // Why: UI gating must be reproducible and analyzable (Variant/condition control).
    // Note: Optional so older tokens remain verifiable server-side; UI will treat missing as false.
    sidePanelEnabled?: boolean;
};

function b64urlEncode(input: Buffer | string) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
    return buf
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function b64urlDecodeToString(input: string) {
    const pad = 4 - (input.length % 4 || 4);
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    return Buffer.from(b64, "base64").toString("utf8");
}

function hmacSha256(secret: string, data: string) {
    return crypto.createHmac("sha256", secret).update(data).digest();
}

export function signStudyToken(args: {
    participantId: string;
    accessCode: string;
    secret: string;
    // What: lifetime of token in seconds.
    // Why: keep sessions short; reload loses token anyway, but expiry prevents long-lived copies.
    ttlSeconds?: number;

    // What: UI gating claim for the Data Insights panel.
    // Why: The client must decide if the side panel is allowed without an extra API call.
    sidePanelEnabled?: boolean;
}): string {
    const now = Math.floor(Date.now() / 1000);
    const ttl = args.ttlSeconds ?? 60 * 60 * 2; // 2 hours

    const header = {alg: "HS256", typ: "JWT"};
    const payload: StudyTokenPayload = {
        sub: args.participantId,
        accessCode: args.accessCode,
        iat: now,
        exp: now + ttl,
        sidePanelEnabled: args.sidePanelEnabled,
    };

    const encHeader = b64urlEncode(JSON.stringify(header));
    const encPayload = b64urlEncode(JSON.stringify(payload));
    const signingInput = `${encHeader}.${encPayload}`;

    const sig = hmacSha256(args.secret, signingInput);
    const encSig = b64urlEncode(sig);

    return `${signingInput}.${encSig}`;
}

export function verifyStudyToken(args: {
    token: string;
    secret: string;
}): { ok: true; payload: StudyTokenPayload } | { ok: false; error: string } {
    const parts = args.token.split(".");
    if (parts.length !== 3) return {ok: false, error: "Invalid token format."};

    const [encHeader, encPayload, encSig] = parts;
    const signingInput = `${encHeader}.${encPayload}`;

    const expectedSig = b64urlEncode(hmacSha256(args.secret, signingInput));
    if (!crypto.timingSafeEqual(Buffer.from(encSig), Buffer.from(expectedSig))) {
        return {ok: false, error: "Invalid token signature."};
    }

    let payload: StudyTokenPayload;
    try {
        payload = JSON.parse(b64urlDecodeToString(encPayload));
    } catch {
        return {ok: false, error: "Invalid token payload."};
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
        return {ok: false, error: "Token expired."};
    }

    if (!payload.sub || !payload.accessCode) {
        return {ok: false, error: "Token missing required fields."};
    }

    return {ok: true, payload};
}
