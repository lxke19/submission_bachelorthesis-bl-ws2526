// app/modules/auth/api.ts
//
// Client-Helper für Login / Registrierung / Logout.
// Wird vom Management-Login-UI verwendet.

export type AuthResult = { ok: true } | { ok: false; error: string };

export type InitTotpResult =
    | { ok: true; secret: string; otpauthUrl: string }
    | { ok: false; error: string };

export async function initTotpSetup(username: string): Promise<InitTotpResult> {
    const res = await fetch("/api/auth/register-totp-init", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({username}),
    });

    if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return {ok: false, error: data?.error ?? "2FA-Initialisierung fehlgeschlagen"};
    }

    const data = (await res.json().catch(() => null)) as
        | { secret?: string; otpauthUrl?: string; error?: string }
        | null;

    if (!data?.secret || !data.otpauthUrl) {
        return {ok: false, error: data?.error ?? "2FA-Initialisierung: Antwort unvollständig"};
    }

    return {ok: true, secret: data.secret, otpauthUrl: data.otpauthUrl};
}

export async function registerFirstAdmin(
    username: string,
    password: string,
    totpSecret: string,
    totpCode: string,
): Promise<AuthResult> {
    const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({username, password, totpSecret, totpCode}),
    });

    if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return {ok: false, error: data?.error ?? "Registrierung fehlgeschlagen"};
    }

    return {ok: true};
}

export async function login(
    username: string,
    password: string,
    totpCode: string,
): Promise<AuthResult> {
    const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({username, password, totpCode}),
    });

    if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return {ok: false, error: data?.error ?? "Login fehlgeschlagen"};
    }

    return {ok: true};
}

export async function logout(): Promise<void> {
    await fetch("/api/auth/logout", {method: "POST"});
}
