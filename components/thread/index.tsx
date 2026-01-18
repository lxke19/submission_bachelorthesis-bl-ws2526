// components/thread/index.tsx
//
// PATCH (Drop-in, minimal; UI-only policy enforcement + Side Panel client logging)
// ==============================================================================
// What changed (and why):
// - Added a small client-side logger that POSTs side-panel open/close events to
//   `/api/study/side-panel/event` whenever the Data Insights panel is toggled.
// - This fixes the missing "client logic": the server route existed, but nothing called it.
// - Logging runs ONLY in public study (NOT in /management), because the endpoint requires
//   a study participant bearer token.
// - Handles thread switches while the panel is open:
//   - closes the span for the previous threadId
//   - opens a new span for the new threadId (if still open)
//
// IMPORTANT RULES (kept):
// - Management: tool-call toggle + uploads enabled.
// - Public study: no tool-call toggle UI, no upload UI, no paste/drop uploads.
// - Variant gating: side panel allowed only if Participant.sidePanelEnabled (or JWT claim). Unknown => disabled.
// - If sidePanelAllowed=false: force-close panel + do not shift layout.
// - Helper popup behavior unchanged (in-memory; resets on thread change / remount).

"use client";

import {v4 as uuidv4} from "uuid";
import {ReactNode, useEffect, useMemo, useRef} from "react";
import {motion} from "framer-motion";
import {cn} from "@/lib/utils";
import {useStreamContext} from "@/providers/Stream";
import {useState, FormEvent} from "react";
import {Button} from "../ui/button";
import {Checkpoint, Message} from "@langchain/langgraph-sdk";
import {AssistantMessage, AssistantMessageLoading} from "./messages/ai";
import {HumanMessage} from "./messages/human";
import {
    DO_NOT_RENDER_ID_PREFIX,
    ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";
import {TooltipIconButton} from "./tooltip-icon-button";
import {
    ArrowDown,
    LoaderCircle,
    PanelRightOpen,
    PanelRightClose,
    SquarePen,
    XIcon,
    Plus,
} from "lucide-react";
import {useQueryState, parseAsBoolean} from "nuqs";
import {StickToBottom, useStickToBottomContext} from "use-stick-to-bottom";
import {toast} from "sonner";
import {useMediaQuery} from "@/hooks/useMediaQuery";
import {Label} from "../ui/label";
import {Switch} from "../ui/switch";
import {useFileUpload} from "@/hooks/use-file-upload";
import {ContentBlocksPreview} from "./ContentBlocksPreview";
import {
    useArtifactOpen,
    ArtifactContent,
    ArtifactTitle,
    useArtifactContext,
} from "./artifact";
import DataInsightsPanel from "./data-insights/data-insights-panel";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {useOptionalStudySession} from "@/app/modules/publicStudy/StudySessionProvider";
import {usePathname} from "next/navigation";

function StickyToBottomContent(props: {
    content: ReactNode;
    footer?: ReactNode;
    className?: string;
    contentClassName?: string;
}) {
    const context = useStickToBottomContext();
    return (
        <div
            ref={context.scrollRef}
            style={{width: "100%", height: "100%"}}
            className={props.className}
        >
            <div ref={context.contentRef} className={props.contentClassName}>
                {props.content}
            </div>

            {props.footer}
        </div>
    );
}

function ScrollToBottom(props: { className?: string }) {
    const {isAtBottom, scrollToBottom} = useStickToBottomContext();

    if (isAtBottom) return null;
    return (
        <Button
            variant="outline"
            className={props.className}
            onClick={() => scrollToBottom()}
        >
            <ArrowDown className="h-4 w-4"/>
            <span>Scroll to bottom</span>
        </Button>
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
 * DataInsightsHelperPopup
 * =======================
 *
 * Small “helper” popup anchored next to the Data Insights toggle button.
 *
 * Behavior:
 * - Shows by default.
 * - If user closes it: stays closed until threadId changes OR component remounts.
 * - Only renders when the side panel is actually allowed AND the toggle button exists.
 *
 * IMPORTANT (requested):
 * - Position & color are intentionally controlled in ONE place below.
 *   Look for the comments:
 *   - "ANPASSEN: POSITION"
 *   - "ANPASSEN: FARBE"
 */
function DataInsightsHelperPopup(props: {
    open: boolean;
    onClose: () => void;
}) {
    if (!props.open) return null;

    return (
        <div
            // ANPASSEN: POSITION
            // - This popup is anchored to the toggle button wrapper (which is `relative`).
            // - Move it down/up or left/right by adjusting:
            //   - "top-full" / "bottom-full"
            //   - "mt-3" (gap below the button)
            //   - "left-0" / "right-0"
            className={[
                "absolute z-30",
                "top-full left-0 mt-3", // ← ANPASSEN: POSITION (z.B. mt-6, right-0, etc.)
                "w-[320px] max-w-[80vw]",
            ].join(" ")}
        >
            <div
                // ANPASSEN: FARBE
                // - Make it more/less “dark red” by changing bg/border/text here.
                className={[
                    "relative rounded-2xl border shadow-lg",
                    "px-4 py-3",
                    "bg-rose-950 border-rose-800 text-white", // ← ANPASSEN: FARBE
                ].join(" ")}
            >
                <button
                    type="button"
                    aria-label="Close help"
                    onClick={props.onClose}
                    className="absolute right-2 top-2 inline-flex items-center justify-center rounded-md p-1 hover:bg-white/10"
                >
                    <XIcon className="size-4 text-white"/>
                </button>

                <div className="pr-6">
                    <div className="text-xs font-semibold tracking-wide text-white/90">
                        Hinweis
                    </div>
                    <div className="mt-1 text-sm leading-relaxed text-white">
                        Hier kannst du Datenqualitätsmerkmale einsehen, die dir helfen können
                        zu entscheiden, ob du dich auf die Antwort des Assistenten verlassen
                        kannst.
                    </div>
                </div>
            </div>
        </div>
    );
}

export function Thread() {
    const [artifactContext, setArtifactContext] = useArtifactContext();
    const [artifactOpen, closeArtifact] = useArtifactOpen();

    const [threadId, _setThreadId] = useQueryState("threadId");
    const [dataInsightsOpen, setDataInsightsOpen] = useQueryState(
        "dataInsightsOpen",
        parseAsBoolean.withDefault(false),
    );
    const [hideToolCalls, setHideToolCalls] = useQueryState(
        "hideToolCalls",
        parseAsBoolean.withDefault(false),
    );
    const [input, setInput] = useState("");
    const {
        contentBlocks,
        setContentBlocks,
        handleFileUpload,
        dropRef,
        removeBlock,
        resetBlocks: _resetBlocks,
        dragOver,
        handlePaste,
    } = useFileUpload();
    const [firstTokenReceived, setFirstTokenReceived] = useState(false);
    const isLargeScreen = useMediaQuery("(min-width: 1024px)");

    /**
     * Context detection (Management vs Public Study).
     *
     * Why pathname-based:
     * - This Thread component is shared across multiple routes.
     * - Management lives under /management/* (protected), study lives elsewhere.
     *
     * Policy:
     * - Management: show advanced controls (tool-call toggle, upload UI).
     * - Study: hard-disable these features in the UI to avoid biasing participants.
     */
    const pathname = usePathname();
    const isManagement = useMemo(() => {
        return pathname.startsWith("/management");
    }, [pathname]);

    /**
     * Variant gating: side panel allowed?
     *
     * - Management: always allowed.
     * - Public study: allowed only when Participant.sidePanelEnabled is true.
     *   We infer it from the public session token (JWT claim) when possible.
     *   If unknown → default false (do not leak panel).
     */
    const optionalSessionCtx = useOptionalStudySession();
    const token = optionalSessionCtx?.session?.token ?? null;

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
     * Public study hardening (tool calls)
     * -----------------------------------
     * Participants must not see tool-call traces.
     * We force hideToolCalls=true whenever we are NOT in management.
     *
     * Notes:
     * - Toggle UI remains management-only.
     * - This is UI-only; it does not change backend tool availability.
     */
    useEffect(() => {
        if (!isManagement && hideToolCalls !== true) {
            void setHideToolCalls(true);
        }
    }, [isManagement, hideToolCalls, setHideToolCalls]);

    // If side panel is not allowed, force-close it even if query param is set.
    useEffect(() => {
        if (!sidePanelAllowed && dataInsightsOpen) {
            void setDataInsightsOpen(false);
        }
    }, [sidePanelAllowed, dataInsightsOpen, setDataInsightsOpen]);

    // Effective open state that respects sidePanelAllowed.
    const dataInsightsOpenEffective = sidePanelAllowed ? !!dataInsightsOpen : false;

    /**
     * Side panel usage logging (client -> server)
     * ------------------------------------------
     * This is the missing piece you pointed out:
     * - `/api/study/side-panel/event` exists, but nothing was calling it.
     *
     * Rules:
     * - Only log in public study (NOT management), because the endpoint requires a participant token.
     * - Log transitions open/close.
     * - If threadId changes while open: close old span, then open a new span for the new thread.
     * - If the panel is opened BEFORE threadId exists: defer the "open" event, then send it once threadId becomes available.
     *
     * Best-effort:
     * - Failures should never break the chat UI; we swallow errors.
     */
    const prevPanelOpenRef = useRef<boolean>(false);
    const prevThreadIdRef = useRef<string | null>(null);

    // Refs for true-unmount cleanup only (avoid double-close via effect cleanup on dependency changes).
    const sidePanelLogTokenRef = useRef<string | null>(null);
    const sidePanelAllowedRef = useRef<boolean>(false);
    const isManagementRef = useRef<boolean>(false);

    useEffect(() => {
        sidePanelLogTokenRef.current = token ?? null;
    }, [token]);

    useEffect(() => {
        sidePanelAllowedRef.current = sidePanelAllowed;
        isManagementRef.current = isManagement;
    }, [sidePanelAllowed, isManagement]);

    useEffect(() => {
        if (isManagement) {
            // Never call study endpoints from management.
            prevPanelOpenRef.current = false;
            prevThreadIdRef.current = null;
            return;
        }

        // If panel isn't allowed, treat as closed (and don't log).
        if (!sidePanelAllowed) {
            prevPanelOpenRef.current = false;
            prevThreadIdRef.current = null;
            return;
        }

        // No token => cannot authenticate the event endpoint.
        if (!token) {
            prevPanelOpenRef.current = false;
            prevThreadIdRef.current = null;
            return;
        }

        const curOpen = Boolean(dataInsightsOpenEffective);
        const curThreadId = threadId ? String(threadId) : null;

        const prevOpen = prevPanelOpenRef.current;
        const prevTid = prevThreadIdRef.current;

        const postEvent = async (open: boolean, tid: string | null) => {
            // IMPORTANT: we only log when we have a concrete thread id.
            // If the user opens the panel before threadId exists, we defer logging until threadId appears.
            if (!tid) return;

            try {
                await fetch("/api/study/side-panel/event", {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        open,
                        langGraphThreadId: tid,
                    }),
                });
            } catch {
                // Best-effort: do not surface to participants.
            }
        };

        // Case A: Panel was opened before threadId existed, and threadId appears while still open.
        // -> Send the missing "open" event now.
        if (curOpen && prevOpen && !prevTid && curThreadId) {
            void postEvent(true, curThreadId);
            prevPanelOpenRef.current = true;
            prevThreadIdRef.current = curThreadId;
            return;
        }

        // Thread changed while panel is open -> close old, open new.
        if (curOpen && prevOpen && prevTid && curThreadId && prevTid !== curThreadId) {
            void postEvent(false, prevTid);
            void postEvent(true, curThreadId);
            prevPanelOpenRef.current = true;
            prevThreadIdRef.current = curThreadId;
            return;
        }

        // Panel still open, but threadId disappeared (rare edge): close previous thread span.
        if (curOpen && prevOpen && prevTid && !curThreadId) {
            void postEvent(false, prevTid);
            prevPanelOpenRef.current = true;
            prevThreadIdRef.current = null;
            return;
        }

        // Closed -> Opened
        if (curOpen && !prevOpen) {
            // If no threadId yet: mark open in refs, and we will log once threadId becomes available.
            void postEvent(true, curThreadId);
            prevPanelOpenRef.current = true;
            prevThreadIdRef.current = curThreadId;
            return;
        }

        // Opened -> Closed
        if (!curOpen && prevOpen) {
            // Prefer the previous known threadId (the one that was actually open).
            void postEvent(false, prevTid ?? curThreadId);
            prevPanelOpenRef.current = false;
            prevThreadIdRef.current = curThreadId;
            return;
        }

        // No transition; just keep refs in sync.
        prevPanelOpenRef.current = curOpen;
        prevThreadIdRef.current = curThreadId;
    }, [
        isManagement,
        sidePanelAllowed,
        dataInsightsOpenEffective,
        threadId,
        token,
    ]);

    // True unmount safety close:
    // - Must NOT be implemented as cleanup of the main logging effect, because that cleanup also runs
    //   on dependency changes (causing double-close events).
    useEffect(() => {
        return () => {
            if (isManagementRef.current) return;
            if (!sidePanelAllowedRef.current) return;

            const t = sidePanelLogTokenRef.current;
            if (!t) return;

            if (!prevPanelOpenRef.current) return;
            const tid = prevThreadIdRef.current;
            if (!tid) return;

            try {
                // Use sendBeacon when available for unload reliability.
                const payload = JSON.stringify({open: false, langGraphThreadId: tid});
                if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
                    const blob = new Blob([payload], {type: "application/json"});
                    navigator.sendBeacon("/api/study/side-panel/event", blob);
                } else {
                    fetch("/api/study/side-panel/event", {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            authorization: `Bearer ${t}`,
                        },
                        body: payload,
                        // keepalive helps during unload in some browsers
                        keepalive: true as any,
                    }).catch(() => {
                    });
                }
            } catch {
                // best-effort
            }
        };
    }, []);

    const stream = useStreamContext();
    const messages = stream.messages;
    const isLoading = stream.isLoading;

    const lastError = useRef<string | undefined>(undefined);

    const setThreadId = (id: string | null) => {
        void _setThreadId(id);

        // close artifact and reset artifact context
        closeArtifact();
        setArtifactContext({});
    };

    /**
     * Helper popup state (Data Insights toggle)
     * ----------------------------------------
     * Requested behavior:
     * - Show on ALL tasks (no task gating here).
     * - If user closes it: keep closed until:
     *   - threadId changes (new chat / "New thread"), OR
     *   - page reload / route change (component remount).
     *
     * We implement the simplest solution:
     * - In-memory state only (no storage).
     * - When `threadId` changes, we re-open the popup.
     */
    const [dataInsightsHelperOpen, setDataInsightsHelperOpen] = useState(true);
    const prevThreadIdPopupRef = useRef<string | null>(null);

    useEffect(() => {
        const cur = threadId ? String(threadId) : null;
        const prev = prevThreadIdPopupRef.current;

        // Re-open the helper whenever the chat changes (new thread).
        // This triggers on:
        // - “New thread” (threadId becomes null)
        // - Next task loads a new threadId
        // - Any other threadId change
        if (cur !== prev) {
            setDataInsightsHelperOpen(true);
            prevThreadIdPopupRef.current = cur;
        }
    }, [threadId]);

    useEffect(() => {
        if (!stream.error) {
            lastError.current = undefined;
            return;
        }
        try {
            const message = (stream.error as any).message;
            if (!message || lastError.current === message) {
                // Message has already been logged. do not modify ref, return early.
                return;
            }

            // Message is defined, and it has not been logged yet. Save it, and send the error
            lastError.current = message;
            toast.error("An error occurred. Please try again.", {
                description: (
                    <p>
                        <strong>Error:</strong> <code>{message}</code>
                    </p>
                ),
                richColors: true,
                closeButton: true,
            });
        } catch {
            // no-op
        }
    }, [stream.error]);

    // TODO: this should be part of the useStream hook
    const prevMessageLength = useRef(0);
    useEffect(() => {
        if (
            messages.length !== prevMessageLength.current &&
            messages?.length &&
            messages[messages.length - 1].type === "ai"
        ) {
            setFirstTokenReceived(true);
        }

        prevMessageLength.current = messages.length;
    }, [messages]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if ((input.trim().length === 0 && contentBlocks.length === 0) || isLoading)
            return;
        setFirstTokenReceived(false);

        const newHumanMessage: Message = {
            id: uuidv4(),
            type: "human",
            content: [
                ...(input.trim().length > 0 ? [{type: "text", text: input}] : []),
                ...contentBlocks,
            ] as Message["content"],
        };

        const toolMessages = ensureToolCallsHaveResponses(stream.messages);

        const context =
            Object.keys(artifactContext).length > 0 ? artifactContext : undefined;

        stream.submit(
            {messages: [...toolMessages, newHumanMessage], context},
            {
                streamMode: ["values"],
                streamSubgraphs: true,
                streamResumable: true,
                optimisticValues: (prev) => ({
                    ...prev,
                    context,
                    messages: [
                        ...(prev.messages ?? []),
                        ...toolMessages,
                        newHumanMessage,
                    ],
                }),
            },
        );

        setInput("");
        setContentBlocks([]);
    };

    const handleRegenerate = (parentCheckpoint: Checkpoint | null | undefined) => {
        // Do this so the loading state is correct
        prevMessageLength.current = prevMessageLength.current - 1;
        setFirstTokenReceived(false);
        stream.submit(undefined, {
            checkpoint: parentCheckpoint,
            streamMode: ["values"],
            streamSubgraphs: true,
            streamResumable: true,
        });
    };

    const chatStarted = !!threadId || !!messages.length;
    const hasNoAIOrToolMessages = !messages.find(
        (m) => m.type === "ai" || m.type === "tool",
    );

    return (
        <div className="flex h-full min-h-0 w-full overflow-hidden">
            {/* Mobile: Sheet (wie im alten ThreadHistory), side="left" */}
            {sidePanelAllowed && (
                <div className="lg:hidden">
                    <Sheet
                        open={dataInsightsOpenEffective && !isLargeScreen}
                        onOpenChange={(open) => {
                            if (isLargeScreen) return;
                            // sidePanelAllowed is true here, so we can toggle normally.
                            void setDataInsightsOpen(open);
                        }}
                    >
                        <SheetContent side="left" className="flex lg:hidden">
                            <SheetHeader>
                                <SheetTitle>Data Insights</SheetTitle>
                            </SheetHeader>
                            <div className="min-h-0 flex-1">
                                <DataInsightsPanel/>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            )}

            {/* Desktop: Panel links (Animation/Shift identisch zur alten ThreadHistory) */}
            {sidePanelAllowed && (
                <div className="relative hidden h-full lg:flex">
                    <motion.div
                        className="absolute z-20 h-full overflow-hidden border-r bg-white"
                        style={{width: 300}}
                        animate={
                            isLargeScreen
                                ? {x: dataInsightsOpenEffective ? 0 : -300}
                                : {x: dataInsightsOpenEffective ? 0 : -300}
                        }
                        initial={{x: -300}}
                        transition={
                            isLargeScreen
                                ? {type: "spring", stiffness: 300, damping: 30}
                                : {duration: 0}
                        }
                    >
                        <div className="relative h-full" style={{width: 300}}>
                            <DataInsightsPanel/>
                        </div>
                    </motion.div>
                </div>
            )}

            <div
                className={cn(
                    "grid h-full min-h-0 w-full grid-cols-[1fr_0fr] transition-all duration-500",
                    artifactOpen && "grid-cols-[3fr_2fr]",
                )}
            >
                <motion.div
                    className={cn(
                        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                        !chatStarted && "grid-rows-[1fr]",
                    )}
                    layout={isLargeScreen}
                    animate={{
                        marginLeft: dataInsightsOpenEffective ? (isLargeScreen ? 300 : 0) : 0,
                        width: dataInsightsOpenEffective
                            ? isLargeScreen
                                ? "calc(100% - 300px)"
                                : "100%"
                            : "100%",
                    }}
                    transition={
                        isLargeScreen
                            ? {type: "spring", stiffness: 300, damping: 30}
                            : {duration: 0}
                    }
                >
                    {!chatStarted && (
                        <div
                            className="absolute top-0 left-0 z-10 flex w-full items-center justify-between gap-3 p-2 pl-4">
                            <div>
                                {sidePanelAllowed && (!dataInsightsOpenEffective || !isLargeScreen) && (
                                    // IMPORTANT: wrapper is `relative` so the helper popup can anchor to it.
                                    <div className="relative inline-flex">
                                        <Button
                                            className="hover:bg-gray-100"
                                            variant="ghost"
                                            onClick={() => setDataInsightsOpen((p) => !p)}
                                        >
                                            {dataInsightsOpenEffective ? (
                                                <PanelRightOpen className="size-5"/>
                                            ) : (
                                                <PanelRightClose className="size-5"/>
                                            )}
                                        </Button>

                                        {/* Helper popup next to Data Insights toggle */}
                                        <DataInsightsHelperPopup
                                            open={dataInsightsHelperOpen}
                                            onClose={() => setDataInsightsHelperOpen(false)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {chatStarted && (
                        <div className="relative z-10 flex items-center justify-between gap-3 p-2">
                            <div className="relative flex items-center justify-start gap-2">
                                <div className="absolute left-0 z-10">
                                    {sidePanelAllowed && (!dataInsightsOpenEffective || !isLargeScreen) && (
                                        // IMPORTANT: wrapper is `relative` so the helper popup can anchor to it.
                                        <div className="relative inline-flex">
                                            <Button
                                                className="hover:bg-gray-100"
                                                variant="ghost"
                                                onClick={() => setDataInsightsOpen((p) => !p)}
                                            >
                                                {dataInsightsOpenEffective ? (
                                                    <PanelRightOpen className="size-5"/>
                                                ) : (
                                                    <PanelRightClose className="size-5"/>
                                                )}
                                            </Button>

                                            {/* Helper popup next to Data Insights toggle */}
                                            <DataInsightsHelperPopup
                                                open={dataInsightsHelperOpen}
                                                onClose={() => setDataInsightsHelperOpen(false)}
                                            />
                                        </div>
                                    )}
                                </div>
                                <motion.button
                                    className="flex cursor-pointer items-center gap-2"
                                    onClick={() => setThreadId(null)}
                                    animate={{
                                        marginLeft: !dataInsightsOpenEffective ? 48 : 0,
                                    }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 30,
                                    }}
                                >
                  <span className="text-xl font-semibold tracking-tight">
                    Agent
                  </span>
                                </motion.button>
                            </div>

                            <div className="flex items-center gap-4">
                                <TooltipIconButton
                                    size="lg"
                                    className="p-4"
                                    tooltip="New thread"
                                    variant="ghost"
                                    onClick={() => setThreadId(null)}
                                >
                  <span className="flex items-center gap-2">
                    <SquarePen className="size-5"/>
                  </span>
                                </TooltipIconButton>
                            </div>

                            <div
                                className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b"/>
                        </div>
                    )}

                    <StickToBottom className="relative flex-1 min-h-0 overflow-hidden">
                        <StickyToBottomContent
                            className={cn(
                                "absolute inset-0 overflow-y-scroll px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent",
                                !chatStarted && "mt-[25vh] flex flex-col items-stretch",
                                chatStarted && "grid grid-rows-[1fr_auto]",
                            )}
                            contentClassName="pt-8 pb-16 max-w-3xl mx-auto flex flex-col gap-4 w-full"
                            content={
                                <>
                                    {messages
                                        .filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
                                        .map((message, index) =>
                                            message.type === "human" ? (
                                                <HumanMessage
                                                    key={message.id || `${message.type}-${index}`}
                                                    message={message}
                                                    isLoading={isLoading}
                                                />
                                            ) : (
                                                <AssistantMessage
                                                    key={message.id || `${message.type}-${index}`}
                                                    message={message}
                                                    isLoading={isLoading}
                                                    handleRegenerate={handleRegenerate}
                                                />
                                            ),
                                        )}
                                    {/* Special rendering case where there are no AI/tool messages, but there is an interrupt.
                    We need to render it outside of the messages list, since there are no messages to render */}
                                    {hasNoAIOrToolMessages && !!stream.interrupt && (
                                        <AssistantMessage
                                            key="interrupt-msg"
                                            message={undefined}
                                            isLoading={isLoading}
                                            handleRegenerate={handleRegenerate}
                                        />
                                    )}
                                    {isLoading && !firstTokenReceived && <AssistantMessageLoading/>}
                                </>
                            }
                            footer={
                                <div className="sticky bottom-0 flex flex-col items-center gap-8 bg-white">
                                    {!chatStarted && (
                                        <div className="flex items-center gap-3">
                                            <h1 className="text-2xl font-semibold tracking-tight">
                                                Agent
                                            </h1>
                                        </div>
                                    )}

                                    <ScrollToBottom
                                        className="animate-in fade-in-0 zoom-in-95 absolute bottom-full left-1/2 mb-4 -translate-x-1/2"/>

                                    <div
                                        // Public study hard-disable:
                                        // - do not attach the dropRef → prevents drag&drop uploads entirely
                                        // Management:
                                        // - keep dropRef so users can upload by dropping files
                                        ref={isManagement ? dropRef : undefined}
                                        className={cn(
                                            "bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl shadow-xs transition-all",
                                            // Only show drop-state styling in management (since drop is enabled only there).
                                            isManagement && dragOver
                                                ? "border-primary border-2 border-dotted"
                                                : "border border-solid",
                                        )}
                                    >
                                        <form
                                            onSubmit={handleSubmit}
                                            className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2"
                                        >
                                            <ContentBlocksPreview
                                                blocks={contentBlocks}
                                                onRemove={removeBlock}
                                            />
                                            <textarea
                                                value={input}
                                                onChange={(e) => setInput(e.target.value)}
                                                // Public study hard-disable:
                                                // - do not pass handlePaste → prevents clipboard file/image pastes from creating upload blocks
                                                onPaste={isManagement ? handlePaste : undefined}
                                                onKeyDown={(e) => {
                                                    if (
                                                        e.key === "Enter" &&
                                                        !e.shiftKey &&
                                                        !e.metaKey &&
                                                        !e.nativeEvent.isComposing
                                                    ) {
                                                        e.preventDefault();
                                                        const el = e.target as HTMLElement | undefined;
                                                        const form = el?.closest("form");
                                                        form?.requestSubmit();
                                                    }
                                                }}
                                                placeholder="Type your message..."
                                                className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 shadow-none ring-0 outline-none focus:ring-0 focus:outline-none"
                                            />

                                            <div className="flex items-center gap-6 p-2 pt-4">
                                                {/* Management only: allow toggling tool-call visibility */}
                                                {isManagement && (
                                                    <div>
                                                        <div className="flex items-center space-x-2">
                                                            <Switch
                                                                id="render-tool-calls"
                                                                checked={hideToolCalls ?? false}
                                                                onCheckedChange={setHideToolCalls}
                                                            />
                                                            <Label
                                                                htmlFor="render-tool-calls"
                                                                className="text-sm text-gray-600"
                                                            >
                                                                Hide Tool Calls
                                                            </Label>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Management only: show upload UI */}
                                                {isManagement && (
                                                    <>
                                                        <Label
                                                            htmlFor="file-input"
                                                            className="flex cursor-pointer items-center gap-2"
                                                        >
                                                            <Plus className="size-5 text-gray-600"/>
                                                            <span className="text-sm text-gray-600">
                                Upload PDF or Image
                              </span>
                                                        </Label>
                                                        <input
                                                            id="file-input"
                                                            type="file"
                                                            onChange={handleFileUpload}
                                                            multiple
                                                            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                                                            className="hidden"
                                                        />
                                                    </>
                                                )}

                                                {stream.isLoading ? (
                                                    <Button
                                                        key="stop"
                                                        onClick={() => stream.stop()}
                                                        className="ml-auto"
                                                    >
                                                        <LoaderCircle className="h-4 w-4 animate-spin"/>
                                                        Cancel
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        type="submit"
                                                        className="ml-auto shadow-md transition-all"
                                                        disabled={
                                                            isLoading ||
                                                            (!input.trim() && contentBlocks.length === 0)
                                                        }
                                                    >
                                                        Send
                                                    </Button>
                                                )}
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            }
                        />
                    </StickToBottom>
                </motion.div>
                <div className="relative flex min-h-0 flex-col border-l">
                    <div className="absolute inset-0 flex min-w-[30vw] flex-col">
                        <div className="grid grid-cols-[1fr_auto] border-b p-4">
                            <ArtifactTitle className="truncate overflow-hidden"/>
                            <button onClick={closeArtifact} className="cursor-pointer">
                                <XIcon className="size-5"/>
                            </button>
                        </div>
                        <ArtifactContent className="relative flex-grow"/>
                    </div>
                </div>
            </div>
        </div>
    );
}
