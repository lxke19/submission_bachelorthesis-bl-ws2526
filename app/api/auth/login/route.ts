// app/api/auth/login/route.ts
//
// Login mit Benutzername + Passwort + optional TOTP.
// Benutzername entspricht dem "email"-Feld in der User-Tabelle.

import {NextRequest, NextResponse} from "next/server";
import bcrypt from "bcryptjs";
import {prisma} from "@/app/lib/prisma";
import {SignJWT} from "jose";
import {SESSION_COOKIE_NAME, getSecretKey} from "@/app/lib/auth";
import {
    handleFailedLoginForUser,
    handleSuccessfulLoginForUser,
} from "@/app/lib/bruteforce";
import {verifyTotpToken} from "@/app/lib/totp";

type LoginBody = {
    username?: string;
    password?: string;
    totpCode?: string;
};

function isLoginBody(value: unknown): value is LoginBody {
    if (value === null || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    if (v.username !== undefined && typeof v.username !== "string") return false;
    if (v.password !== undefined && typeof v.password !== "string") return false;
    if (v.totpCode !== undefined && typeof v.totpCode !== "string") return false;
    return true;
}

function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
    const json = (await req.json().catch(() => null)) as unknown;
    if (!isLoginBody(json)) {
        return NextResponse.json({error: "Ungültiger Request-Body"}, {status: 400});
    }

    const username = json.username?.trim();
    const password = json.password;
    const totpCode = json.totpCode?.trim();

    if (!username || !password) {
        return NextResponse.json(
            {error: "Benutzername und Passwort sind erforderlich"},
            {status: 400},
        );
    }

    if (!isEmail(username)) {
        return NextResponse.json(
            {error: "Der Benutzername muss eine gültige E-Mail-Adresse sein."},
            {status: 400},
        );
    }

    const user = await prisma.user.findUnique({where: {email: username}});

    if (!user) {
        return NextResponse.json({error: "Ungültige Zugangsdaten"}, {status: 401});
    }

    if (user.permanentLock) {
        return NextResponse.json(
            {error: "Dieses Konto ist dauerhaft gesperrt. Bitte wende dich an den Administrator."},
            {status: 403},
        );
    }

    if (user.isLocked) {
        return NextResponse.json(
            {
                error:
                    "Dieses Konto ist vorübergehend gesperrt. Bitte nutze den Entsperr-Link oder wende dich an den Administrator.",
            },
            {status: 423},
        );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
        await handleFailedLoginForUser(user.id, user.failedLoginAttempts ?? 0);
        return NextResponse.json({error: "Ungültige Zugangsdaten"}, {status: 401});
    }

    // 2FA erforderlich?
    if (user.twoFactorEnabled) {
        if (!user.twoFactorSecret) {
            console.error("[AUTH] User mit twoFactorEnabled=true aber ohne Secret:", user.id);
            return NextResponse.json(
                {error: "Login ist aktuell nicht möglich. Bitte wende dich an den Administrator."},
                {status: 500},
            );
        }

        if (!totpCode) {
            return NextResponse.json({error: "Zwei-Faktor-Code ist erforderlich."}, {status: 401});
        }

        const validTotp = verifyTotpToken(user.twoFactorSecret, totpCode);
        if (!validTotp) {
            await handleFailedLoginForUser(user.id, user.failedLoginAttempts ?? 0);
            return NextResponse.json({error: "Ungültige Zugangsdaten"}, {status: 401});
        }
    }

    await handleSuccessfulLoginForUser(user.id);

    const token = await new SignJWT({sub: user.id, type: "session"})
        .setProtectedHeader({alg: "HS256", typ: "JWT"})
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(getSecretKey());

    const res = NextResponse.json({
        user: {id: user.id, email: user.email, name: user.name},
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    });

    return res;
}
