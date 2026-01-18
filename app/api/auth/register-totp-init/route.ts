// app/api/auth/register-totp-init/route.ts
//
// Initialisiert TOTP-Setup für die Registrierung:
// - erlaubt nur, solange weniger als 3 Benutzer existieren (wie in deinem Code)
// - gibt ein Secret + otpauth:// URL zurück
//
// WICHTIG:
// - Route Handler im App Router müssen in: app/api/**/route.ts liegen
// - Der Pfad /api/auth/register-totp-init entsteht exakt aus dem Ordnernamen
// - Diese Route läuft auf Node.js (nicht Edge), weil wir Node-Libs nutzen.

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {buildTotpUri, generateTotpSecret} from "@/app/lib/totp";

export const runtime = "nodejs";

type InitTotpBody = {
    username?: string;
};

function isInitTotpBody(value: unknown): value is InitTotpBody {
    if (value === null || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return !(v.username !== undefined && typeof v.username !== "string");
}

export async function POST(req: NextRequest) {
    const json = (await req.json().catch(() => null)) as unknown;
    if (!isInitTotpBody(json)) {
        return NextResponse.json({error: "Ungültiger Request-Body"}, {status: 400});
    }

    const username = json.username?.trim();
    if (!username) {
        return NextResponse.json(
            {error: "Benutzername ist erforderlich, um 2FA einzurichten."},
            {status: 400},
        );
    }

    // Maximal 3 Benutzer in deinem Setup
    const userCount = await prisma.user.count();
    if (userCount >= 1) {
        return NextResponse.json(
            {error: "Es existiert bereits ein Benutzer. Weitere Registrierungen sind nicht möglich."},
            {status: 400},
        );
    }

    const secret = generateTotpSecret();
    const otpauthUrl = buildTotpUri(secret, username);

    return NextResponse.json({secret, otpauthUrl});
}
