// app/lib/auth.ts
//
// Server-Auth Helpers (App Router).
// Wir nutzen einen signierten Session-Cookie (JWT) und lesen daraus die User-ID.
//
// - getCurrentUser(): für Server Components / Layouts
// - requireApiAuthUserId(): für API Routes

import {cookies} from "next/headers";
import {jwtVerify} from "jose";
import {prisma} from "@/app/lib/prisma";

export const SESSION_COOKIE_NAME = "htv_session";

export function getSecretKey(): Uint8Array {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AUTH_SECRET ist nicht gesetzt");
    }
    return new TextEncoder().encode(secret);
}

async function getUserIdFromCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!cookie?.value) return null;

    try {
        const {payload} = await jwtVerify(cookie.value, getSecretKey());
        if (typeof payload.sub !== "string") return null;
        return payload.sub;
    } catch {
        return null;
    }
}

export async function getCurrentUser() {
    const userId = await getUserIdFromCookie();
    if (!userId) return null;

    return prisma.user.findUnique({
        where: {id: userId},
    });
}

export async function requireAuthenticatedUser() {
    return getCurrentUser();
}

export async function requireApiAuthUserId(): Promise<string | null> {
    return getUserIdFromCookie();
}
