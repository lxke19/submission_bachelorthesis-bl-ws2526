"use client";

// app/modules/publicStudy/components/ChatPersistenceController.tsx
//
// Purpose:
// - Client-side "glue" between LangGraph UI state and App DB persistence.
// - We persist:
//   1) Thread creation (when onThreadId fires and threadId appears in URL)
//   2) Messages (append-only, idempotent)
//   3) Thread close on "New Chat" (threadId becomes null)
//
// Design constraints:
// - Your study auth token is in-memory (StudySessionProvider), so persistence calls must attach Authorization.
// - We avoid writing assistant messages while streaming tokens. Instead:
//   - persist human/tool messages immediately,
//   - persist AI messages when streaming finishes (isLoading true -> false).
//
// Important:
// - We do NOT modify LangGraph server behavior.
// - We do NOT require controlling thread_id generation.
// - All server routes are under /api/study/chat/* and use requireStudyParticipant().
//
// Policy update (anti-spam / request storm fix):
// - NEVER persist ANY AI message while stream.isLoading === true.
// - Only persist AI after streaming finished (isLoading transitions true -> false).
//   This prevents repeated POSTs during token streaming/rerenders.

import React, {useEffect, useMemo, useRef} from "react";
import {useQueryState} from "nuqs";
import {useStreamContext} from "@/providers/Stream";
import type {Message} from "@langchain/langgraph-sdk";
import {DO_NOT_RENDER_ID_PREFIX} from "@/lib/ensure-tool-responses";

// NOTE:
// - This import depends on your StudySessionProvider API.
// - If your provider exposes the token differently, adjust here.
// - The rest of the file stays unchanged.
import {useStudySession} from "@/app/modules/publicStudy/StudySessionProvider";

type CloseReason = "RESTARTED" | "TASK_FINISHED" | "ABANDONED" | "ERROR";

function isRenderableMessage(m: Message) {
    return !(m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX));
}

function isAiMessage(m: Message) {
    return m.type === "ai";
}

function isToolMessage(m: Message) {
    return m.type === "tool";
}

function isHumanMessage(m: Message) {
    return m.type === "human";
}

async function authedPost(token: string, url: string, body: unknown) {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });

    // Fail-fast in dev: easier to debug.
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`POST ${url} failed: ${res.status} ${res.statusText} ${text}`);
    }
    return res.json().catch(() => ({}));
}

export default function ChatPersistenceController(props: { taskNumber: number }) {
    // TS note:
    // Some TS configs still mark default React import as unused in TSX,
    // so we reference it once to keep builds strict and clean.
    void React;

    const stream = useStreamContext();
    const messages = stream.messages;

    const [threadId] = useQueryState("threadId");

    // Study token (in-memory). If missing, we cannot persist.
    const studySession = useStudySession();
    const token = studySession.session?.token ?? null;

    const prevThreadIdRef = useRef<string | null>(null);
    const prevIsLoadingRef = useRef<boolean>(false);

    // De-dupe per LangGraph message.id on the client side (best-effort).
    // Server is still idempotent via metadata.langGraphMessageId.
    const sentMessageIdsRef = useRef<Set<string>>(new Set());

    // Queue messages that appear before threadId is known (optimistic first submit).
    const pendingBeforeThreadRef = useRef<Message[]>([]);

    // What: flag that a restart happened (prev thread closed) and a new thread will appear soon.
    // Why: Stream UI state can briefly still contain old messages during threadId transitions,
    //      and we must not persist those old messages into the *new* ChatThread.
    const justRestartedRef = useRef<boolean>(false);

    // What: capture message ids that belonged to the *previous* thread at the moment we detected a restart.
    // Why:
    // - During restart transitions, the Stream provider may still show old messages for a short time.
    // - We must not persist those old messages into the new thread.
    // - BUT we also must not accidentally drop new optimistic user messages that appear before the new threadId exists.
    const carryoverMessageIdsRef = useRef<Set<string>>(new Set());

    const latestRenderableMessages = useMemo(() => {
        return (messages ?? []).filter(isRenderableMessage);
    }, [messages]);

    // 0) Detect thread transitions and protect against "history carryover".
    useEffect(() => {
        if (!token) return;

        const prev = prevThreadIdRef.current;
        const cur = threadId ?? null;

        // Case A: prev existed -> now cleared (user clicked "New Chat" or routing reset)
        if (prev && !cur) {
            authedPost(token, "/api/study/chat/thread/close", {
                langGraphThreadId: prev,
                reason: "RESTARTED" as CloseReason,
            }).catch((e) => {
                console.error("[ChatPersistenceController] thread close failed", e);
            });

            // Mark that a restart happened; the next threadId that appears should NOT inherit old stream messages.
            justRestartedRef.current = true;

            // Capture current renderable message ids as "carryover" from the old thread.
            // IMPORTANT:
            // We do NOT want to persist these into the next thread.
            // But we also do NOT want to wipe pending messages that belong to the new thread (optimistic user submit).
            carryoverMessageIdsRef.current = new Set();
            for (const m of latestRenderableMessages) {
                if (!m.id) continue;
                carryoverMessageIdsRef.current.add(m.id);
            }

            // Reset per-thread client state.
            sentMessageIdsRef.current = new Set();
            pendingBeforeThreadRef.current = [];
            prevIsLoadingRef.current = false;
        }

        // Case B: prev existed -> directly replaced by a different thread id (no null in between)
        if (prev && cur && prev !== cur) {
            authedPost(token, "/api/study/chat/thread/close", {
                langGraphThreadId: prev,
                reason: "RESTARTED" as CloseReason,
            }).catch((e) => {
                console.error("[ChatPersistenceController] thread close failed", e);
            });

            // Capture messages that are still visible during the transition as carryover from the old thread.
            carryoverMessageIdsRef.current = new Set();
            for (const m of latestRenderableMessages) {
                if (!m.id) continue;
                carryoverMessageIdsRef.current.add(m.id);
            }

            // In this transition, Stream state may still contain the old messages.
            // We must prevent persisting them under the new thread id.
            sentMessageIdsRef.current = new Set(carryoverMessageIdsRef.current);
            pendingBeforeThreadRef.current = [];
            prevIsLoadingRef.current = false;

            // We already applied the carryover-protection for the new thread, no need to wait for a "new threadId appears".
            justRestartedRef.current = false;
        }

        prevThreadIdRef.current = cur;
    }, [threadId, token, latestRenderableMessages]);

    // 1) When a threadId appears -> upsert ChatThread, then flush queued messages.
    useEffect(() => {
        if (!token) return;
        if (!threadId) return;

        // If we just restarted, the Stream provider may still briefly show the old thread's messages.
        // Protect against accidentally persisting those into the new thread by:
        // - marking only the previously-captured carryover ids as "already sent"
        // - keeping any pending optimistic messages that belong to the new thread
        if (justRestartedRef.current) {
            sentMessageIdsRef.current = new Set(carryoverMessageIdsRef.current);

            // Remove any carryover messages from the queue (safety), but DO NOT wipe the queue.
            pendingBeforeThreadRef.current = pendingBeforeThreadRef.current.filter((m) => {
                if (!m.id) return false;
                return !carryoverMessageIdsRef.current.has(m.id);
            });

            prevIsLoadingRef.current = false;
            justRestartedRef.current = false;
        }

        let cancelled = false;

        (async () => {
            // Upsert thread in DB
            await authedPost(token, "/api/study/chat/thread/upsert", {
                langGraphThreadId: threadId,
                taskNumber: props.taskNumber,
            });

            if (cancelled) return;

            // Flush queued messages (if any)
            const queued = pendingBeforeThreadRef.current;
            if (queued.length > 0) {
                pendingBeforeThreadRef.current = [];
                for (const m of queued) {
                    // Only flush messages that have ids.
                    if (!m.id) continue;

                    // Skip carryover ids explicitly (extra safety).
                    if (carryoverMessageIdsRef.current.has(m.id)) continue;

                    if (sentMessageIdsRef.current.has(m.id)) continue;

                    // Policy: NEVER persist AI while streaming.
                    const shouldDelayAi = isAiMessage(m) && stream.isLoading;
                    if (shouldDelayAi) continue;

                    await authedPost(token, "/api/study/chat/message/upsert", {
                        langGraphThreadId: threadId,
                        taskNumber: props.taskNumber, // <-- IMPORTANT: allow server to auto-create thread race-safe
                        message: {
                            id: m.id,
                            type: m.type,
                            content: m.content,
                            // tool fields if present
                            ...(isToolMessage(m) ? {name: (m as any).name, tool_call_id: (m as any).tool_call_id} : {}),
                        },
                    });

                    sentMessageIdsRef.current.add(m.id);
                }
            }
        })().catch((e) => {
            // We avoid toasting here to not spam users; Stream.tsx already handles UI errors.
            console.error("[ChatPersistenceController] thread upsert/flush failed", e);
        });

        return () => {
            cancelled = true;
        };
        // We intentionally include stream.isLoading and latestRenderableMessages in the flush logic above,
        // but we do not want to re-run thread upsert repeatedly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId, token, props.taskNumber]);

    // 3) Persist messages:
    // - human/tool: immediately (once threadId exists)
    // - ai: when streaming finishes (isLoading true -> false)
    useEffect(() => {
        if (!token) return;

        const curThreadId = threadId ?? null;
        const renderables = latestRenderableMessages;

        // If threadId is not known yet, queue messages (optimistic submit case).
        if (!curThreadId) {
            // Store only new messages that have an id and are not already queued.
            for (const m of renderables) {
                if (!m.id) continue;

                // Never queue carryover from previous thread.
                if (carryoverMessageIdsRef.current.has(m.id)) continue;

                if (sentMessageIdsRef.current.has(m.id)) continue;

                // Only queue human/tool immediately; AI is typically not present before threadId anyway.
                if (isHumanMessage(m) || isToolMessage(m) || isAiMessage(m)) {
                    pendingBeforeThreadRef.current.push(m);
                }
            }
            return;
        }

        // Helper to persist one message.
        const persistOne = async (m: Message) => {
            if (!m.id) return;

            // Never persist carryover ids into the current thread.
            if (carryoverMessageIdsRef.current.has(m.id)) return;

            if (sentMessageIdsRef.current.has(m.id)) return;

            await authedPost(token, "/api/study/chat/message/upsert", {
                langGraphThreadId: curThreadId,
                taskNumber: props.taskNumber, // <-- IMPORTANT: allow server to auto-create thread race-safe
                message: {
                    id: m.id,
                    type: m.type,
                    content: m.content,
                    ...(isToolMessage(m) ? {name: (m as any).name, tool_call_id: (m as any).tool_call_id} : {}),
                },
            });

            sentMessageIdsRef.current.add(m.id);
        };

        // Policy:
        // - NEVER persist AI while streaming (stream.isLoading === true)
        // - persist everything else immediately
        (async () => {
            for (const m of renderables) {
                if (!m.id) continue;

                // Never persist carryover ids into the current thread.
                if (carryoverMessageIdsRef.current.has(m.id)) continue;

                if (sentMessageIdsRef.current.has(m.id)) continue;

                const shouldDelayAi = isAiMessage(m) && stream.isLoading;
                if (shouldDelayAi) continue;

                // Persist human/tool immediately; AI only if not streaming.
                if (isHumanMessage(m) || isToolMessage(m) || isAiMessage(m)) {
                    await persistOne(m);
                }
            }

            // Detect "answer finished" (isLoading transitioned true -> false) and flush remaining.
            const prevIsLoading = prevIsLoadingRef.current;
            const curIsLoading = stream.isLoading;

            if (prevIsLoading && !curIsLoading) {
                for (const m of renderables) {
                    if (!m.id) continue;

                    // Never persist carryover ids into the current thread.
                    if (carryoverMessageIdsRef.current.has(m.id)) continue;

                    if (sentMessageIdsRef.current.has(m.id)) continue;
                    await persistOne(m);
                }
            }

            prevIsLoadingRef.current = curIsLoading;
        })().catch((e) => {
            console.error("[ChatPersistenceController] message persistence failed", e);
        });
    }, [latestRenderableMessages, stream.isLoading, threadId, token, props.taskNumber]);

    return null;
}
