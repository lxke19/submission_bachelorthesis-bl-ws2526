// app/lib/mail.ts
//
// Zentrale SMTP-Konfiguration + sendMail().
// Wenn SMTP nicht konfiguriert ist, wird NICHT geworfen - wir loggen nur.
// So bleibt Dev angenehm.

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || "465";
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "My App";
const SMTP_FROM_ADDRESS = process.env.SMTP_FROM_ADDRESS || "noreply@example.org";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

const transport =
    SMTP_HOST && SMTP_USER && SMTP_PASS
        ? nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: SMTP_SECURE,
            auth: {user: SMTP_USER, pass: SMTP_PASS},
        })
        : null;

export type SendMailOptions = {
    to: string;
    subject: string;
    text: string;
    html?: string;
};

export async function sendMail(options: SendMailOptions): Promise<void> {
    if (!transport) {
        console.warn("[mail] SMTP nicht konfiguriert - E-Mail wird NICHT gesendet.");
        console.warn("[mail] Mail wäre gewesen:", {
            from: `${SMTP_FROM_NAME} <${SMTP_FROM_ADDRESS}>`,
            ...options,
        });
        return;
    }

    await transport.sendMail({
        from: `${SMTP_FROM_NAME} <${SMTP_FROM_ADDRESS}>`,
        ...options,
    });
}

export function buildAccountUnlockUrl(token: string): string {
    return `${APP_BASE_URL}/api/auth/unlock?token=${encodeURIComponent(token)}`;
}
