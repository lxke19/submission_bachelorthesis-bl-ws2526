"use client";

// app/modules/publicStudy/hooks.ts
//
// Purpose:
// - Helpers for public pages to enforce "must come through /study entry" rule.
//
// Why:
// - If the session token is missing (after reload), redirect back to /study.
// - If the token belongs to another accessCode, also redirect (prevents mixing).

import {useEffect} from "react";
import {useRouter} from "next/navigation";
import {useStudySession} from "@/app/modules/publicStudy/StudySessionProvider";

export function useRequireStudySession(accessCodeFromUrl: string) {
    const router = useRouter();
    const {session} = useStudySession();

    useEffect(() => {
        if (!session) {
            // What: No in-memory token.
            // Why: User refreshed or opened URL directly => must re-enter access code.
            router.replace("/study");
            return;
        }

        if (session.accessCode !== accessCodeFromUrl) {
            // What: Token is for another participant.
            // Why: Prevent accidental mismatch / copying URLs across participants.
            router.replace("/study");
        }
    }, [router, session, accessCodeFromUrl]);

    return session;
}
