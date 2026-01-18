"use client";

// app/modules/publicStudy/StudySessionProvider.tsx
//
// Purpose:
// - Store the public study session token in React state ONLY (in-memory).
// - Expose helpers to set/clear session.
//
// Why:
// - You want: reload => user must re-enter access code.
// - React state resets on hard reload, so token disappears automatically.
//
// What happens if we used cookies/localStorage?
// - Reload would keep token => user could refresh and keep browsing.
// - That violates your requirement.
//
// IMPORTANT (2026-01-02):
// - Public study pages MUST enforce that hooks are used inside the provider.
// - However, some shared UI (e.g. management chat playground) renders the same Thread UI
//   without the public study provider.
// - Therefore we provide BOTH:
//   1) useStudySession(): strict, throws if provider missing (public study invariants)
//   2) useOptionalStudySession(): non-throwing, returns null if provider missing (management compatibility)

import React, {createContext, useContext, useMemo, useState} from "react";

type StudySession = {
    accessCode: string;
    token: string;
};

type StudySessionContextValue = {
    session: StudySession | null;
    setSession: (session: StudySession) => void;
    clearSession: () => void;
};

const StudySessionContext = createContext<StudySessionContextValue | null>(null);

export function StudySessionProvider({children}: { children: React.ReactNode }) {
    const [session, setSessionState] = useState<StudySession | null>(null);

    const value = useMemo<StudySessionContextValue>(() => {
        return {
            session,
            setSession: (s) => setSessionState(s),
            clearSession: () => setSessionState(null),
        };
    }, [session]);

    React.useEffect(() => {
        console.log("[StudySessionProvider] mounted");
        return () => console.log("[StudySessionProvider] unmounted");
    }, []);

    return (
        <StudySessionContext.Provider value={value}>
            {children}
        </StudySessionContext.Provider>
    );
}

/**
 * Strict hook (public study):
 * - Must only be used inside StudySessionProvider.
 * - This enforces your "reload => no token => back to /study" logic via pages/hooks.
 */
export function useStudySession() {
    const ctx = useContext(StudySessionContext);
    if (!ctx) throw new Error("useStudySession must be used inside StudySessionProvider.");
    return ctx;
}

/**
 * Optional hook (management compatibility):
 * - Returns null if StudySessionProvider is not mounted.
 * - Use this in shared components that must work in both contexts.
 */
export function useOptionalStudySession() {
    return useContext(StudySessionContext);
}
