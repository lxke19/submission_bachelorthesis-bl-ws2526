// app/api/auth/unlock/route.ts
//
// Entsperrt einen zuvor gesperrten Account anhand eines Unlock-Tokens.
// Kein UI notwendig - kann direkt über Link in der Mail aufgerufen werden.

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";

export async function GET(req: NextRequest) {
    const {searchParams} = new URL(req.url);
    const token = searchParams.get("token")?.trim();

    if (!token) {
        return NextResponse.json({ok: false, error: "Kein Token übergeben."}, {status: 400});
    }

    const user = await prisma.user.findFirst({
        where: {unlockToken: token},
    });

    if (!user) {
        return NextResponse.json(
            {ok: false, error: "Ungültiger oder bereits verwendeter Token."},
            {status: 400},
        );
    }

    if (!user.unlockTokenExpiresAt || user.unlockTokenExpiresAt.getTime() < Date.now()) {
        return NextResponse.json({ok: false, error: "Der Entsperr-Link ist abgelaufen."}, {status: 400});
    }

    await prisma.user.update({
        where: {id: user.id},
        data: {
            isLocked: false,
            failedLoginAttempts: 0,
            unlockToken: null,
            unlockTokenExpiresAt: null,
        },
    });

    return NextResponse.json({
        ok: true,
        message: "Der Zugang wurde erfolgreich entsperrt. Du kannst dich jetzt wieder anmelden.",
    });
}
