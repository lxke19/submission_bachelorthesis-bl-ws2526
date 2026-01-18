// components/thread/data-insights/data-insights-panel.tsx
//
// Data Insights Side Panel (Drop-in ready)
// =======================================
//
// Purpose (UX goals)
// ------------------
// - Show *which* datasets were used (table → dataset mapping).
// - Show Data Quality Dimensions using the *real* JSON from ThreadDataQualityLog.indicators.
// - Show the assistant’s DQ explanation text (e.g., timeliness rationale) + coverage details.
// - Stay stable/readable even if the dataset catalog is empty (no invented metadata).
//
// Ordering
// -----------------------
// 1) Data Quality Dimensions
// 2) Datasets
// 3) Notes (definition + explanation)
// 4) Main SQL (optional)
//
//
// Overflow policy
// ---------------------------
// - Any potentially-long text must *not* visually overflow/overlap other UI.
// - Dataset names (the usual offender) are handled specially:
//   → SINGLE LINE + horizontal scroll *only for that line* (instead of spilling over).
// - Other fields use safe wrapping (break-words) and proper flex min-w-0 rules.
//
// Collapsible sections
// -------------------------------
// - "Datasets" and "Main SQL" are collapsible, like an accordion.
// - Both are collapsed by default.
// - Only the section bodies collapse; headers stay visible and clickable.
//Whole header remains clickable; focus/hover states make interaction obvious.

"use client";

import {Button} from "@/components/ui/button";
import {PanelRightOpen, PanelRightClose, ChevronDown} from "lucide-react";
import {useQueryState, parseAsBoolean} from "nuqs";
import {useMemo, useState} from "react";
import {useThreadDataQualityLatest} from "@/components/thread/data-insights/useThreadDataQualityLatest";

function formatBytes(bytesLike: string | null | undefined) {
    if (!bytesLike) return "-";
    const bytes = Number(bytesLike);
    if (!Number.isFinite(bytes) || bytes <= 0) return "-";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let v = bytes;

    while (v >= 1024 && i < units.length - 1) {
        v = v / 1024;
        i++;
    }

    const rounded = i === 0 ? String(Math.round(v)) : v.toFixed(1);
    return `${rounded} ${units[i]}`;
}

function formatDateTimeLocal(iso: string | null | undefined) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
}

/**
 * Generic two-column row that is safe for long text.
 *
 * Key detail:
 * - `min-w-0` on flex children prevents overflow bugs in flex layouts.
 * - values can wrap (break-words) instead of painting over neighboring UI.
 */
function FieldRow({
                      label,
                      value,
                      valueClassName,
                  }: {
    label: string;
    value: string;
    valueClassName?: string;
}) {
    return (
        <div className="flex min-w-0 items-baseline justify-between gap-4">
            <div className="shrink-0 text-gray-600">{label}</div>
            <div
                className={[
                    "min-w-0 flex-1 text-right text-gray-900 break-words",
                    valueClassName ?? "",
                ].join(" ")}
            >
                {value}
            </div>
        </div>
    );
}

/**
 * Single-line horizontal scroller for “dangerously long” labels (dataset names etc.).
 *
 * This solves the exact issue from your screenshot:
 * - It NEVER overlaps the next row.
 * - It keeps this line to one row (no wrapping), but allows scrolling to the right.
 * - Scrollbar appears only when needed (native behavior).
 */
function SingleLineScroll({
                              children,
                              className = "",
                          }: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={[
                "max-w-full overflow-x-auto whitespace-nowrap",
                // subtle scrollbar styling, only for this line
                "[&::-webkit-scrollbar]:h-1.5",
                "[&::-webkit-scrollbar-thumb]:rounded-full",
                "[&::-webkit-scrollbar-thumb]:bg-gray-300",
                "[&::-webkit-scrollbar-track]:bg-transparent",
                className,
            ].join(" ")}
        >
            {children}
        </div>
    );
}

/**
 * Small, reusable section header that can optionally be collapsible.
 *
 * Why this exists:
 * - Keeps "Datasets" and "Main SQL" consistent and easy to toggle.
 * - Only changes what’s necessary (requested behavior), without restructuring the whole file.
 *
 * UX details:
 * - Entire header row is clickable.
 * - Chevron rotates when open/closed.
 * - If `onToggle` is not provided, it behaves like a normal (non-collapsible) header.
 *
 * Affordance fix:
 * - Render as a bordered "header bar" so users instantly recognize it as expandable.
 * - Bigger chevron in a small chip on the right.
 * - Hover/focus ring makes it feel like a real control.
 */
function SectionHeader({
                           title,
                           isOpen,
                           onToggle,
                       }: {
    title: string;
    isOpen?: boolean;
    onToggle?: (() => void) | null;
}) {
    const clickable = typeof onToggle === "function";

    return (
        <div
            className={[
                // Looks like a control, not plain text:
                "flex items-center justify-between rounded-lg border-2 px-3 py-2",
                "bg-gray-50",
                // Interaction affordance:
                clickable ? "cursor-pointer select-none hover:bg-gray-100 focus-within:ring-2 focus-within:ring-gray-300" : "",
            ].join(" ")}
            onClick={() => clickable && onToggle?.()}
            role={clickable ? "button" : undefined}
            aria-expanded={clickable ? Boolean(isOpen) : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(e) => {
                if (!clickable) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle?.();
                }
            }}
        >
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>

            {clickable ? (
                <span className="inline-flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">
            {isOpen ? "Hide" : "Show"}
          </span>
          <span className="inline-flex items-center justify-center rounded-md border-2 bg-white px-2 py-1">
            <ChevronDown
                className={[
                    "size-5 text-gray-700 transition-transform",
                    isOpen ? "rotate-180" : "rotate-0",
                ].join(" ")}
            />
          </span>
        </span>
            ) : null}
        </div>
    );
}

/**
 * Status UI mapping (requested):
 * - NOT_FOUND: grey
 * - OK: green
 * - PARTIAL: dark orange
 * - NOT_OK: red
 * - NOT_EVALUATED: "neutral" (grey/black-ish)
 *
 * If your backend uses different labels later, adapt here.
 */
function statusPill(statusRaw: string | null | undefined) {
    const status = String(statusRaw ?? "NOT_EVALUATED").toUpperCase();

    // Yup: explicit mapping. No "Medium" fairy dust.
    const map: Record<
        string,
        { label: string; dot: string; text: string; border: string; bg: string }
    > = {
        OK: {
            label: "OK",
            dot: "bg-green-500",
            text: "text-green-700",
            border: "border-green-200",
            bg: "bg-green-50",
        },
        PARTIAL: {
            label: "Partial",
            dot: "bg-orange-600",
            text: "text-orange-800",
            border: "border-orange-200",
            bg: "bg-orange-50",
        },
        NOT_OK: {
            label: "Not OK",
            dot: "bg-red-500",
            text: "text-red-700",
            border: "border-red-200",
            bg: "bg-red-50",
        },
        NOT_FOUND: {
            label: "Not found",
            dot: "bg-gray-400",
            text: "text-gray-700",
            border: "border-gray-200",
            bg: "bg-gray-50",
        },
        NOT_EVALUATED: {
            label: "Not evaluated",
            dot: "bg-gray-500",
            text: "text-gray-700",
            border: "border-gray-200",
            bg: "bg-white",
        },
    };

    const v = map[status] ?? map.NOT_EVALUATED;

    return (
        <span
            className={`inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs ${v.border} ${v.bg} ${v.text}`}
        >
      <span className={`h-2 w-2 rounded-full ${v.dot}`}/>
      <span className="font-medium">{v.label}</span>
    </span>
    );
}

type Coverage = {
    missing?: string[];
    observed?: { min?: string | null; max?: string | null };
    requested?: { min?: string | null; max?: string | null };
    granularity?: string | null;
};

function coverageBlock(coverage: Coverage | null | undefined) {
    if (!coverage) return null;

    const missing = Array.isArray(coverage.missing) ? coverage.missing : [];
    const obsMin = coverage.observed?.min ?? null;
    const obsMax = coverage.observed?.max ?? null;
    const reqMin = coverage.requested?.min ?? null;
    const reqMax = coverage.requested?.max ?? null;
    const gran = coverage.granularity ?? null;

    // If everything is empty, don't waste vertical space.
    const hasAnything =
        missing.length > 0 ||
        obsMin !== null ||
        obsMax !== null ||
        reqMin !== null ||
        reqMax !== null ||
        (gran && gran !== "unknown");

    if (!hasAnything) return null;

    return (
        <div className="mt-3 rounded-lg border bg-gray-50 p-3 text-xs text-gray-700">
            <div className="mb-2 font-medium text-gray-900">Coverage</div>

            <div className="space-y-1">
                <FieldRow
                    label="Requested"
                    value={reqMin || reqMax ? `${reqMin ?? "?"} → ${reqMax ?? "?"}` : "-"}
                />
                <FieldRow
                    label="Observed"
                    value={obsMin || obsMax ? `${obsMin ?? "?"} → ${obsMax ?? "?"}` : "-"}
                />
                <FieldRow
                    label="Missing"
                    value={missing.length ? missing.join(", ") : "-"}
                />
                <FieldRow
                    label="Granularity"
                    value={gran && gran !== "unknown" ? String(gran) : "-"}
                />
            </div>
        </div>
    );
}

export default function DataInsightsPanel() {
    const [dataInsightsOpen, setDataInsightsOpen] = useQueryState(
        "dataInsightsOpen",
        parseAsBoolean.withDefault(false),
    );

    const {data, loading, error} = useThreadDataQualityLatest();

    const datasets = useMemo(() => data?.datasets ?? [], [data]);
    const unmatchedTables = useMemo(() => data?.unmatchedTables ?? [], [data]);

    /**
     * Collapsible state (requested)
     * - Datasets: collapsed by default
     * - Main SQL: collapsed by default
     *
     * These are purely UI states; they don't affect data fetching or logging.
     */
    const [datasetsOpen, setDatasetsOpen] = useState(false);
    const [mainSqlOpen, setMainSqlOpen] = useState(false);

    /**
     * Indicators JSON shape:
     * You told me: it's like { "TIMELINESS": { text, status, coverage } }
     * So we read TIMELINESS first.
     * We also accept timeliness for backward compatibility (but TIMELINESS is the real one).
     */
    const indicators = (data?.indicators ?? {}) as any;
    const timeliness = (indicators?.TIMELINESS ?? indicators?.timeliness ?? null) as
        | { text?: string; status?: string; coverage?: Coverage }
        | null;

    const timelinessStatus = timeliness?.status ?? (data ? "NOT_EVALUATED" : "NOT_FOUND");
    const timelinessText = timeliness?.text ?? null;
    const timelinessCoverage = timeliness?.coverage ?? null;

    return (
        <div className="flex h-full w-full flex-col items-start justify-start gap-6">
            {/* Header */}
            <div className="flex w-full items-center justify-between px-4 pt-1.5">
                <Button
                    className="hover:bg-gray-100"
                    variant="ghost"
                    onClick={() => setDataInsightsOpen((p) => !p)}
                    aria-label="Toggle Data Insights"
                >
                    {dataInsightsOpen ? (
                        <PanelRightOpen className="size-5"/>
                    ) : (
                        <PanelRightClose className="size-5"/>
                    )}
                </Button>

                <h1 className="text-xl font-semibold tracking-tight">Data Insights</h1>
                <div className="w-10"/>
            </div>

            <div
                className="flex h-full w-full flex-col gap-6 overflow-y-scroll px-4 pb-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
                {/* =======================
            1) DATA QUALITY DIMENSIONS
            ======================= */}
                <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900">Data Quality Dimensions</h2>

                    <div className="rounded-xl border bg-white p-4 text-sm text-gray-700">
                        {loading ? (
                            <div className="text-gray-500">Loading…</div>
                        ) : error ? (
                            <div className="text-red-600">Failed to load: {error}</div>
                        ) : !data ? (
                            <div className="text-gray-500">No data quality info for this thread yet.</div>
                        ) : (
                            <div className="space-y-3">
                                {/* Timeliness row */}
                                <div className="flex items-center justify-between gap-4">
                                    <div className="font-medium text-gray-900">Timeliness</div>
                                    <div>{statusPill(timelinessStatus)}</div>
                                </div>

                                {/* The actual LLM/DQ explanation text (the whole point) */}
                                {timelinessText ? (
                                    <div className="rounded-lg border bg-white p-3 text-sm text-gray-800">
                                        <div className="mb-1 text-xs font-semibold text-gray-900">Rationale</div>
                                        <div className="leading-relaxed">{timelinessText}</div>

                                        {/* Coverage details if available */}
                                        {coverageBlock(timelinessCoverage)}
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-600">
                                        No timeliness explanation text recorded for this turn.
                                        {/* Yes, this is intentionally blunt. If the backend doesn't store it, the UI can't conjure it. */}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* =======================
            2) DATASETS
            ======================= */}
                <section className="space-y-2">
                    <SectionHeader
                        title="Datasets"
                        isOpen={datasetsOpen}
                        onToggle={() => setDatasetsOpen((p) => !p)}
                    />

                    {!datasetsOpen ? null : (
                        <div className="space-y-3 rounded-xl border bg-white p-4 text-sm text-gray-700">
                            {loading ? (
                                <div className="text-gray-500">Loading…</div>
                            ) : error ? (
                                <div className="text-red-600">Failed to load: {error}</div>
                            ) : !data ? (
                                <div className="text-gray-500">No dataset metadata available yet.</div>
                            ) : datasets.length === 0 && unmatchedTables.length === 0 ? (
                                <div className="text-gray-500">No datasets recorded.</div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Resolved datasets (mapped via DatasetTable) */}
                                    {datasets.map((ds: any) => {
                                        const name = ds.displayName ?? ds.key ?? "-";
                                        const loadedAt = formatDateTimeLocal(ds.updatedAt);

                                        return (
                                            <div key={ds.key} className="rounded-lg border bg-gray-50 p-3">
                                                {/* Dataset title: single-line horizontal scroll ONLY here */}
                                                <SingleLineScroll className="mb-2 font-medium text-gray-900">
                                                    {name}
                                                </SingleLineScroll>

                                                <div className="space-y-1">
                                                    {/* Dataset Name value: also single-line horizontal scroll ONLY for this row */}
                                                    <FieldRow
                                                        label="Dataset Name"
                                                        value={name}
                                                        valueClassName="break-normal whitespace-nowrap overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent"
                                                    />
                                                    <FieldRow label="Origin" value={ds.origin ?? "-"}/>
                                                    <FieldRow label="Author" value={ds.author ?? "-"}/>
                                                    <FieldRow label="Loaded at" value={loadedAt}/>
                                                    <FieldRow label="File Type" value={ds.fileType ?? "-"}/>
                                                    <FieldRow label="File Size" value={formatBytes(ds.fileSizeBytes)}/>
                                                    <FieldRow
                                                        label="Record Count"
                                                        value={typeof ds.recordCount === "number" ? String(ds.recordCount) : "-"}
                                                    />
                                                </div>

                                                {Array.isArray(ds.tables) && ds.tables.length > 0 && (
                                                    <div className="mt-2 text-xs text-gray-600">
                                                        Matched tables: {ds.tables.join(", ")}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Unmatched tables (catalog not filled yet) */}
                                    {unmatchedTables.map((t: string) => (
                                        <div key={t} className="rounded-lg border bg-white p-3">
                                            {/* Unmatched dataset title: same single-line horizontal scroll behavior */}
                                            <SingleLineScroll className="mb-2 font-medium text-gray-900">
                                                {t}
                                            </SingleLineScroll>

                                            <div className="space-y-1">
                                                <FieldRow
                                                    label="Dataset Name"
                                                    value={t}
                                                    valueClassName="break-normal whitespace-nowrap overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent"
                                                />
                                                <FieldRow label="Origin" value="-"/>
                                                <FieldRow label="Author" value="-"/>
                                                <FieldRow label="Loaded at" value="-"/>
                                                <FieldRow label="File Type" value="-"/>
                                                <FieldRow label="File Size" value="-"/>
                                                <FieldRow label="Record Count" value="-"/>
                                            </div>

                                            <div className="mt-2 text-xs text-gray-500">
                                                Dataset catalog entry not found yet (will be filled later).
                                                {/* This is the honest state. Anything else would be UI theater. */}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* =======================
            3) NOTES (definition + how it is computed)
            ======================= */}
                <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900">Notes</h2>

                    <div className="space-y-3 rounded-xl border bg-white p-4 text-sm text-gray-700">
                        <div className="space-y-2">
                            <div className="text-sm font-semibold text-gray-900">Timeliness (definition)</div>
                            <div className="leading-relaxed text-gray-700">
                                Timeliness refers to the extent to which data are sufficiently current and temporally
                                appropriate for a specific task or decision context.
                                It evaluates whether the available data cover the required time period without relevant
                                gaps and whether their currency meets the user’s analytical needs.
                                Because timeliness is task-dependent, data may be considered only partially timely if
                                the observed temporal coverage does not fully match the requested timeframe.
                                <br/>
                                Based on Wang & Strong (1996)
                            </div>
                        </div>
                    </div>
                </section>

                {/* =======================
            4) MAIN SQL (optional)
            ======================= */}
                <section className="space-y-2">
                    <SectionHeader
                        title="Main SQL"
                        isOpen={mainSqlOpen}
                        onToggle={() => setMainSqlOpen((p) => !p)}
                    />

                    {!mainSqlOpen ? null : (
                        <div className="space-y-3 rounded-xl border bg-white p-4 text-sm text-gray-700">
                            {loading ? (
                                <div className="text-gray-500">Loading…</div>
                            ) : !data ? (
                                <div className="text-gray-500">No SQL recorded for this thread yet.</div>
                            ) : data?.mainSql ? (
                                <pre className="max-h-72 overflow-auto rounded-lg bg-gray-100 p-3 text-xs">
                {data.mainSql}
              </pre>
                            ) : (
                                <div className="text-gray-500">No Main SQL stored for this turn.</div>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
