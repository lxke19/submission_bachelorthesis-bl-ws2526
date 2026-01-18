// components/thread/data-insights/useThreadDataQualityLatest.tsx
"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {useQueryState} from "nuqs";
import {useOptionalStudySession} from "@/app/modules/publicStudy/StudySessionProvider";
import {useStreamContext} from "@/providers/Stream";

type ThreadDatasetMeta = {
    key: string;
    displayName: string | null;
    origin: string | null;
    author: string | null;
    fileType: string | null;
    fileSizeBytes: string | null;
    recordCount: number | null;
    tables: string[];
};

type ThreadDQ = {
    id: string;
    createdAt: string;
    indicators: any;
    usedTables: string[];
    mainSql: string | null;
    dqSql: string | null;
    datasets: ThreadDatasetMeta[];
    unmatchedTables: string[];
} | null;

type ApiResponse = { ok: true; data: ThreadDQ } | { ok: false; error: string };

// Cache nur für NON-null (sonst stuck)
const cache = new Map<string, ThreadDQ>();

function dbg(...args: any[]) {
    if (process.env.NODE_ENV !== "production") console.debug("[useThreadDQ]", ...args);
}

/**
 * useThreadDataQualityLatest
 * =========================
 *
 * Default behavior:
 * - Fetch latest ThreadDataQualityLog for current threadId.
 * - Cache only non-null results.
 * - Retry a few times if data isn't available yet.
 *
 * IMPORTANT: enabled flag
 * ----------------------
 * - Some UIs (AiSourcesInline) must ONLY fetch for the "latest AI message".
 * - When enabled=false, this hook must not fetch (and must not spam retries).
 * - We intentionally DO NOT clear existing `data` when disabled, so callers can freeze snapshots.
 */
export function useThreadDataQualityLatest(opts?: { enabled?: boolean }) {
    const enabled = opts?.enabled ?? true;

    const stream = useStreamContext();
    const [threadId] = useQueryState("threadId");

    const optionalSessionCtx = useOptionalStudySession();
    const token = optionalSessionCtx?.session?.token ?? null;

    const [data, setData] = useState<ThreadDQ>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const key = useMemo(() => (threadId ? String(threadId) : null), [threadId]);

    const isManagement = useMemo(() => {
        if (typeof window === "undefined") return false;
        return window.location.pathname.startsWith("/management");
    }, []);

    // Refetch trigger when answer finished / new AI message
    const [nonce, setNonce] = useState(0);
    const prevIsLoadingRef = useRef<boolean>(false);
    const prevLastAiIdRef = useRef<string | null>(null);

    useEffect(() => {
        // If disabled, do not drive invalidation/refetch churn.
        // Still update refs so we don't "backfire" when re-enabled.
        const prev = prevIsLoadingRef.current;
        const cur = stream.isLoading;

        const lastAi = [...(stream.messages ?? [])].reverse().find(m => m.type === "ai");
        const lastAiId = (lastAi?.id ? String(lastAi.id) : null);

        if (!enabled) {
            prevIsLoadingRef.current = cur;
            prevLastAiIdRef.current = lastAiId;
            return;
        }

        const finished = prev && !cur;
        const newAi = lastAiId && lastAiId !== prevLastAiIdRef.current;

        if (finished || newAi) {
            if (key) {
                cache.delete(key); // invalidate cache for this thread
            }
            dbg("invalidate", {key, finished, newAi, lastAiId});
            setNonce((n) => n + 1);
        }

        prevIsLoadingRef.current = cur;
        prevLastAiIdRef.current = lastAiId;
    }, [stream.isLoading, stream.messages, key, enabled]);

    const abortRef = useRef<AbortController | null>(null);
    const retryTimersRef = useRef<number[]>([]);
    const retryAttemptRef = useRef(0);

    function clearRetries() {
        for (const t of retryTimersRef.current) window.clearTimeout(t);
        retryTimersRef.current = [];
        retryAttemptRef.current = 0;
    }

    useEffect(() => {
        // If disabled, abort any in-flight request and stop retries.
        // Do NOT clear data: callers may want to freeze the last known snapshot.
        if (!enabled) {
            abortRef.current?.abort();
            clearRetries();
            setLoading(false);
            setError(null);
            dbg("skip: disabled", {key, hasToken: !!token, isManagement, nonce});
            return;
        }

        setError(null);

        dbg("effect", {key, hasToken: !!token, isManagement, nonce});

        if (!key) {
            setData(null);
            clearRetries();
            return;
        }

        // Public requires token, management doesn't
        if (!token && !isManagement) {
            dbg("skip: no token and not management", {key});
            setData(null);
            clearRetries();
            return;
        }

        // cache hit (only non-null)
        if (cache.has(key)) {
            const cached = cache.get(key) ?? null;
            dbg("cache hit", {key, cached: !!cached});
            setData(cached);
            return;
        }

        abortRef.current?.abort();
        clearRetries();

        const ac = new AbortController();
        abortRef.current = ac;

        const doFetch = async () => {
            setLoading(true);

            const headers: Record<string, string> = {};
            if (token) headers.authorization = `Bearer ${token}`;

            dbg("fetch start", {key, headers: Object.keys(headers)});

            const res = await fetch(
                `/api/study/chat/thread/dq/latest?threadId=${encodeURIComponent(key)}`,
                {headers, signal: ac.signal},
            );

            dbg("fetch response", {status: res.status, ok: res.ok});

            const json = (await res.json().catch(() => null)) as ApiResponse | null;
            dbg("fetch json", json);

            if (!json || !("ok" in json)) throw new Error("Invalid response");
            if (!json.ok) throw new Error(json.error);

            // IMPORTANT: don't cache null (prevents “stuck”)
            if (json.data) cache.set(key, json.data);

            setData(json.data ?? null);
            setError(null);

            // Race handling: if still null, retry a few times (thread/DQ might arrive slightly later)
            if (!json.data) {
                const delays = [600, 1500, 3000];
                const attempt = retryAttemptRef.current;

                if (attempt < delays.length) {
                    const delay = delays[attempt];
                    retryAttemptRef.current += 1;

                    dbg("schedule retry", {attempt: attempt + 1, delayMs: delay, key});
                    const timer = window.setTimeout(() => {
                        if (ac.signal.aborted) return;
                        // try again; also invalidate any accidental cache
                        cache.delete(key);
                        doFetch().catch(() => {
                        });
                    }, delay);

                    retryTimersRef.current.push(timer);
                } else {
                    dbg("no more retries", {key});
                }
            }
        };

        doFetch()
            .catch((e: any) => {
                if (e?.name === "AbortError") return;
                dbg("fetch error", e);
                setError(String(e?.message ?? e));
                setData(null);
            })
            .finally(() => setLoading(false));

        return () => {
            ac.abort();
            clearRetries();
        };
    }, [token, key, isManagement, nonce, enabled]);

    return {threadId: key, token, data, loading, error};
}
