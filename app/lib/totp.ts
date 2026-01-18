// app/lib/totp.ts
//
// TOTP Utilities (Google Authenticator, 1Password, etc.)
// - generateTotpSecret(): neues Secret
// - buildTotpUri(): otpauth:// URL für QR Code
// - verifyTotpToken(): Code validieren

import {authenticator} from "otplib";

const TOTP_ISSUER = process.env.TOTP_ISSUER || "My App Admin";

export function generateTotpSecret(): string {
    return authenticator.generateSecret();
}

export function buildTotpUri(secret: string, accountName: string): string {
    return authenticator.keyuri(accountName, TOTP_ISSUER, secret);
}

export function verifyTotpToken(secret: string, token: string): boolean {
    try {
        return authenticator.verify({token, secret});
    } catch {
        return false;
    }
}
