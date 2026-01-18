// app/lib/bruteforce.ts
//
// Brute-force Schutz / Account Lockout.
// Wird von /api/auth/login genutzt.
//
// Strategie (einfach & robust):
// - Bei falschem Login: failedLoginAttempts++
// - Ab N Fehlversuchen: isLocked=true und Unlock-Token erzeugen
// - Optional: Unlock-Link per Mail (wenn SMTP konfiguriert)
//
// In Prod kannst du das später erweitern:
// - IP-based throttling
// - Redis rate limiting
// - separate Audit-Tabelle

import crypto from "crypto";
import {prisma} from "@/app/lib/prisma";
import {sendMail, buildAccountUnlockUrl} from "@/app/lib/mail";

const MAX_FAILED_ATTEMPTS = 5;
const UNLOCK_TOKEN_TTL_MINUTES = 30;

function makeToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

export async function handleFailedLoginForUser(
    userId: string,
    currentFailedAttempts: number,
): Promise<void> {
    const nextAttempts = (currentFailedAttempts ?? 0) + 1;

    // Erst nur hochzählen
    if (nextAttempts < MAX_FAILED_ATTEMPTS) {
        await prisma.user.update({
            where: {id: userId},
            data: {
                failedLoginAttempts: nextAttempts,
            },
        });
        return;
    }

    // Ab Threshold sperren + Unlock-Token erzeugen
    const token = makeToken();
    const expires = new Date(Date.now() + UNLOCK_TOKEN_TTL_MINUTES * 60_000);

    const user = await prisma.user.update({
        where: {id: userId},
        data: {
            failedLoginAttempts: nextAttempts,
            isLocked: true,
            unlockToken: token,
            unlockTokenExpiresAt: expires,
        },
    });

    // Mail ist optional. Wenn SMTP nicht konfiguriert: nur Log.
    const url = buildAccountUnlockUrl(token);
    await sendMail({
        to: user.email,
        subject: "Account entsperren",
        text:
            `Dein Account wurde wegen zu vieler Fehlversuche gesperrt.\n\n` +
            `Entsperren: ${url}\n\n` +
            `Der Link ist ${UNLOCK_TOKEN_TTL_MINUTES} Minuten gültig.`,
    });
}

export async function handleSuccessfulLoginForUser(userId: string): Promise<void> {
    await prisma.user.update({
        where: {id: userId},
        data: {
            failedLoginAttempts: 0,
            isLocked: false,
            unlockToken: null,
            unlockTokenExpiresAt: null,
        },
    });
}
