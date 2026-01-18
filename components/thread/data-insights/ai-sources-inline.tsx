// components/thread/data-insights/ai-sources-inline.tsx
"use client";

//
// AiSourcesInline (Inline Source Summary under AI answers)
// =======================================================
//
// Purpose
// -------
// - Show a short, non-intrusive summary of which datasets/tables the *current* answer used.
// - Provide a single "Explain Data" button that opens the Data Insights side panel.
//
// Data contract
// ------------
// - The data is fetched via useThreadDataQualityLatest(), which returns the latest
//   ThreadDataQualityLog entry for the current LangGraph threadId.
// - If the dataset catalog is not populated yet, we fall back to showing unmatched table names.
// - We do NOT fabricate metadata. If it is not available, we render "-".
//
// UX constraints
// --------------
// - Must be compact and readable in the chat flow.
// - Must be safe when data is not available yet (loading state and null state).
// - Must not crash if fields are missing or timestamps are invalid.
//
// Variant / Study policy (IMPORTANT)
// ---------------------------------
// - Participants can be assigned to different variants.
// - The decisive flag is Participant.sidePanelEnabled.
// - If sidePanelEnabled is false:
//   - The inline chip MUST NOT offer an "Explain Data" button (no way to open the panel).
//
// Implementation note:
// - We try to read sidePanelEnabled from the study session token if it is a JWT that carries the claim.
// - If we cannot determine it (unknown token format), we default to "disabled" in public study for safety.
// - Management (/management/*) always has it enabled.
//
// IMPORTANT: "latest-only button + frozen data"
// ---------------------------------------------
// - Only the *latest AI message* is allowed to show the "Explain Data" button.
// - Only the *latest AI message* is allowed to actively fetch and update DQ data.
// - When a message stops being the latest AI message:
//   - Its chip freezes and keeps the data it last had.
//   - The "Explain Data" button disappears (only the last chip has it).
// - Older chips must NOT update to newer data (they must keep the historical snapshot they had).
//
// NEW (Inline Timeliness Status; gated)
// ------------------------------------
// - If sidePanelAllowed is true (management or Variant 2 / sidePanelEnabled):
//   - Show the short TIMELINESS status label inline (OK / Partial / Not OK / ...).
// - If sidePanelAllowed is false: do not render any timeliness status (avoid leaking DQ signals).

import {useEffect, useMemo, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {useThreadDataQualityLatest} from "./useThreadDataQualityLatest";
import {useQueryState, parseAsBoolean} from "nuqs";
import {useOptionalStudySession} from "@/app/modules/publicStudy/StudySessionProvider";

function formatDateTimeLocal(iso: string | null | undefined) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
}

/**
 * Normalize TIMELINESS status to a short human label.
 *
 * IMPORTANT:
 * - We do not invent statuses. If missing, we return "-".
 * - We accept both "TIMELINESS" and legacy "timeliness" keys.
 */
function formatTimelinessStatusLabel(indicators: any): string {
    const timeliness = indicators?.TIMELINESS ?? indicators?.timeliness ?? null;
    const raw = timeliness?.status ?? null;
    if (!raw) return "-";

    const s = String(raw).toUpperCase();
    if (s === "OK") return "OK";
    if (s === "PARTIAL") return "Partial";
    if (s === "NOT_OK") return "Not OK";
    if (s === "NOT_FOUND") return "Not found";
    if (s === "NOT_EVALUATED") return "Not evaluated";

    // Unknown future value: show as-is (safe and debuggable).
    return String(raw);
}

/**
 * Inline status pill for TIMELINESS.
 *
 * Requested behavior:
 * - Use the same color semantics as the Data Insights panel.
 * - Make it "thick and clearly recognizable".
 * - PARTIAL must be a dark orange.
 *
 * Notes:
 * - This is gated by `sidePanelAllowed` (no DQ signal leakage).
 * - If status is missing/unknown, we show a neutral pill (or "-").
 */
function statusPillInline(statusRaw: string | null | undefined, label: string) {
    const status = String(statusRaw ?? "NOT_EVALUATED").toUpperCase();

    const map: Record<
        string,
        { dot: string; text: string; border: string; bg: string }
    > = {
        OK: {
            dot: "bg-green-500",
            text: "text-green-800",
            border: "border-green-200",
            bg: "bg-green-50",
        },
        PARTIAL: {
            dot: "bg-orange-600",
            text: "text-orange-900",
            border: "border-orange-200",
            bg: "bg-orange-50",
        },
        NOT_OK: {
            dot: "bg-red-500",
            text: "text-red-800",
            border: "border-red-200",
            bg: "bg-red-50",
        },
        NOT_FOUND: {
            dot: "bg-gray-400",
            text: "text-gray-800",
            border: "border-gray-200",
            bg: "bg-gray-50",
        },
        NOT_EVALUATED: {
            dot: "bg-gray-500",
            text: "text-gray-800",
            border: "border-gray-200",
            bg: "bg-white",
        },
    };

    const v = map[status] ?? map.NOT_EVALUATED;

    return (
        <span
            className={[
                "inline-flex items-center gap-2 rounded-full border-2 px-2.5 py-1 text-xs font-semibold",
                v.border,
                v.bg,
                v.text,
            ].join(" ")}
        >
            <span className={`h-2.5 w-2.5 rounded-full ${v.dot}`}/>
            <span>{label}</span>
        </span>
    );
}

/**
 * Best-effort: read `sidePanelEnabled` from a JWT payload (no verification).
 *
 * Expected payload shape (example):
 * - { sidePanelEnabled: true, ... }
 *
 * If token is not a JWT or parsing fails → return null.
 */
function readSidePanelEnabledFromToken(token: string | null): boolean | null {
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    try {
        // base64url → base64 (+ padding)
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const jsonStr = atob(padded);
        const payload = JSON.parse(jsonStr) as any;

        return typeof payload?.sidePanelEnabled === "boolean"
            ? payload.sidePanelEnabled
            : null;
    } catch {
        return null;
    }
}

/**
 * In-memory snapshot cache keyed by messageId.
 *
 * Why:
 * - We want older inline chips to keep showing the data they had when they were last.
 * - If the component ever re-mounts, we can restore the frozen snapshot without refetching.
 *
 * Notes:
 * - This is intentionally in-memory only (same as the study session token).
 * - It resets on hard reload, which is fine for the public study model.
 */
const frozenByMessageId = new Map<string, any>();

export default function AiSourcesInline(props: {
    messageId: string;
    isLatestAiMessage: boolean;
}) {
    /**
     * Only the latest AI message should actively fetch DQ data.
     * Older messages freeze their data and must NOT update to new data.
     */
    const {data: liveData, loading: liveLoading} = useThreadDataQualityLatest({
        enabled: props.isLatestAiMessage,
    });

    // Clicking "Explain Data" opens the side panel that shows the full breakdown.
    const [, setDataInsightsOpen] = useQueryState(
        "dataInsightsOpen",
        parseAsBoolean.withDefault(false),
    );

    /**
     * Determine whether the side panel is allowed for the current user/context.
     *
     * - Management: always allowed.
     * - Public study: allowed only if Participant.sidePanelEnabled is true.
     *   We infer it from the public session token (JWT claim) when possible.
     *   If unknown → default false (do not leak panel).
     */
    const optionalSessionCtx = useOptionalStudySession();
    const token = optionalSessionCtx?.session?.token ?? null;

    const isManagement = useMemo(() => {
        if (typeof window === "undefined") return false;
        return window.location.pathname.startsWith("/management");
    }, []);

    const sidePanelAllowed = useMemo(() => {
        if (isManagement) return true;

        // Preferred: explicit session field if you ever store it there.
        const explicit = (optionalSessionCtx?.session as any)?.sidePanelEnabled;
        if (typeof explicit === "boolean") return explicit;

        // Fallback: read JWT claim.
        const fromToken = readSidePanelEnabledFromToken(token);
        if (typeof fromToken === "boolean") return fromToken;

        // Safety default for public study: disabled.
        return false;
    }, [isManagement, optionalSessionCtx?.session, token]);

    /**
     * Frozen snapshot state.
     *
     * Behavior:
     * - While this message is the latest AI message → render liveData (updates allowed).
     * - When it stops being the latest AI message → freeze (store last liveData) and never update again.
     */
    const [frozenData, setFrozenData] = useState<any>(() => {
        return frozenByMessageId.get(props.messageId) ?? null;
    });

    const prevIsLatestRef = useRef<boolean>(props.isLatestAiMessage);

    useEffect(() => {
        const prev = prevIsLatestRef.current;
        const cur = props.isLatestAiMessage;

        // Transition: latest -> not latest => freeze snapshot (keep the last known live data).
        if (prev && !cur) {
            if (liveData) {
                setFrozenData(liveData);
                frozenByMessageId.set(props.messageId, liveData);
            }
        }

        // Keep ref updated
        prevIsLatestRef.current = cur;
    }, [props.isLatestAiMessage, props.messageId, liveData]);

    // Choose which data to render:
    // - latest AI message: live (can update)
    // - older: frozen (stable snapshot)
    const data = props.isLatestAiMessage ? liveData : frozenData;

    // Loading should only show on the latest chip (older ones must not "load" again).
    const loading = props.isLatestAiMessage ? liveLoading : false;

    // Keep these derived values stable and resilient.
    const datasets = useMemo(() => data?.datasets ?? [], [data]);
    const unmatchedTables = useMemo(() => data?.unmatchedTables ?? [], [data]);

    const originLabel = useMemo(() => {
        const origins = datasets.map((d: any) => d?.origin).filter(Boolean);
        if (origins.length === 0) return "-";
        const uniq = Array.from(new Set(origins));
        return uniq.length === 1 ? String(uniq[0]) : "Multiple sources";
    }, [datasets]);

    // Inline DQ indicator summary (Timeliness status), gated by sidePanelAllowed.
    const timelinessStatusRaw = useMemo(() => {
        if (!sidePanelAllowed) return null;
        if (!data) return null;
        const indicators = (data as any)?.indicators ?? null;
        const timeliness = indicators?.TIMELINESS ?? indicators?.timeliness ?? null;
        return timeliness?.status ?? null;
    }, [sidePanelAllowed, data]);

    const timelinessStatusLabel = useMemo(() => {
        if (!sidePanelAllowed) return null;
        if (!data) return null;
        const indicators = (data as any)?.indicators ?? null;
        return formatTimelinessStatusLabel(indicators);
    }, [sidePanelAllowed, data]);

    // Explicit null state (no data recorded for this answer/thread yet).
    // We do not show a spinner here because loading=false already tells us nothing is coming *right now*.
    if (!loading && !data) {
        return (
            <div className="mt-3 max-w-3xl">
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs text-gray-500">
                    No source information available for this answer yet.
                </div>
            </div>
        );
    }

    const hasDatasets = datasets.length > 0;
    const hasUnmatched = unmatchedTables.length > 0;

    return (
        <div className="mt-3 max-w-3xl">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="space-y-1 text-xs text-gray-700">
                        <div>
                            <span className="font-medium text-gray-900">Source:</span>{" "}
                            <span>{loading ? "Loading…" : ""}</span>
                        </div>

                        {!loading && (
                            <div className="space-y-1">
                                {hasDatasets ? (
                                    datasets.map((ds: any) => {
                                        const name = ds?.displayName ?? ds?.key ?? "-";
                                        // Important: this is the dataset catalog timestamp (used as "Loaded at"),
                                        // not the DQ log timestamp.
                                        const loadedAt = formatDateTimeLocal(ds?.updatedAt);

                                        return (
                                            <div
                                                key={String(ds?.key ?? name)}
                                                className="flex items-baseline justify-between gap-4"
                                            >
                                                <span className="text-gray-900">{name}</span>
                                                <span className="text-gray-600">
                          Loaded at: {loadedAt}
                        </span>
                                            </div>
                                        );
                                    })
                                ) : hasUnmatched ? (
                                    unmatchedTables.map((t: string) => (
                                        <div
                                            key={t}
                                            className="flex items-baseline justify-between gap-4"
                                        >
                                            <span className="text-gray-900">{t}</span>
                                            <span className="text-gray-500">Loaded at: -</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-gray-500">-</div>
                                )}
                            </div>
                        )}

                        <div>
                            <span className="font-medium text-gray-900">Origin:</span>{" "}
                            <span>{loading ? "—" : originLabel}</span>
                        </div>

                        {/* Inline DQ snippet (Variant 2 / management only). */}
                        {sidePanelAllowed && timelinessStatusLabel ? (
                            <div className="pt-1">
                                <span className="mr-2 font-medium text-gray-900">Timeliness:</span>
                                {loading ? (
                                    <span>—</span>
                                ) : (
                                    statusPillInline(timelinessStatusRaw, timelinessStatusLabel)
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* Study variant policy:
            - If sidePanelAllowed is false → do not render any "Explain Data" action.
            Latest-only policy:
            - Only the latest AI message may render the button. */}
                    {sidePanelAllowed && props.isLatestAiMessage ? (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={loading || !data}
                            onClick={() => void setDataInsightsOpen(true)}
                            aria-label="Open Data Insights"
                        >
                            Explain Data
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
