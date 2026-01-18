// app/api/auth/register/route.ts
//
// Legt einen Admin-User an (Setup).
// Hier: maximal 3 Benutzer erlaubt (wie in deinem Beispiel).

import {NextRequest, NextResponse} from "next/server";
import bcrypt from "bcryptjs";
import {prisma} from "@/app/lib/prisma";
import {SignJWT} from "jose";
import {SESSION_COOKIE_NAME, getSecretKey} from "@/app/lib/auth";
import {verifyTotpToken} from "@/app/lib/totp";

type RegisterBody = {
    username?: string;
    password?: string;
    totpSecret?: string;
    totpCode?: string;
};

function isRegisterBody(value: unknown): value is RegisterBody {
    if (value === null || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    if (v.username !== undefined && typeof v.username !== "string") return false;
    if (v.password !== undefined && typeof v.password !== "string") return false;
    if (v.totpSecret !== undefined && typeof v.totpSecret !== "string") return false;
    return !(v.totpCode !== undefined && typeof v.totpCode !== "string");

}

function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
    const json = (await req.json().catch(() => null)) as unknown;
    if (!isRegisterBody(json)) {
        return NextResponse.json({error: "Ungültiger Request-Body"}, {status: 400});
    }

    const username = json.username?.trim();
    const password = json.password;
    const totpSecret = json.totpSecret?.trim();
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

    const userCount = await prisma.user.count();
    if (userCount >= 1) {
        return NextResponse.json(
            {error: "Es existiert bereits ein Benutzer. Weitere Registrierungen sind nicht möglich."},
            {status: 400},
        );
    }

    // 2FA ist Pflicht bei Registrierung
    if (!totpSecret || !totpCode) {
        return NextResponse.json(
            {error: "Für die Registrierung ist die Einrichtung der Zwei-Faktor-Authentifizierung erforderlich."},
            {status: 400},
        );
    }

    const validTotp = verifyTotpToken(totpSecret, totpCode);
    if (!validTotp) {
        return NextResponse.json(
            {error: "Der eingegebene Zwei-Faktor-Code ist ungültig."},
            {status: 400},
        );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
        data: {
            email: username,
            passwordHash,
            name: username,
            twoFactorSecret: totpSecret,
            twoFactorEnabled: true,
        },
    });

    const token = await new SignJWT({sub: user.id, type: "session"})
        .setProtectedHeader({alg: "HS256", typ: "JWT"})
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(getSecretKey());

    const res = NextResponse.json(
        {user: {id: user.id, email: user.email, name: user.name}},
        {status: 201},
    );

    res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    });

    return res;
}
