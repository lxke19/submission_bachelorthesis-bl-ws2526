// components/thread/messages/ai.tsx
//
// AssistantMessage Rendering
// =========================
//
// Purpose
// -------
// - Render assistant messages (markdown) and optional tool call blocks.
// - Render tool result messages when tool calls are present.
// - Render interrupts and custom UI components.
//
// Policy (Management vs Public Study)
// -----------------------------------
// - Management (/management/*):
//   - Tool calls can be shown/hidden using the "hideToolCalls" query param toggle in the UI.
// - Public study (everything else):
//   - Tool calls and tool result messages are HARD hidden, regardless of query params.
//   - This prevents participants from seeing extra technical info that could bias results.
//
// Notes
// -----
// - This only affects UI rendering. It does not change whether the backend/graph can call tools.
//
// Data Insights inline chip policy (IMPORTANT)
// -------------------------------------------
// - Every AI message renders an inline chip (AiSourcesInline) so older messages keep showing
//   the source summary they had at the time.
// - BUT: only the *latest AI message* is allowed to show the "Explain Data" button.
// - Once a message is no longer the latest AI message, the button disappears and the chip freezes
//   (it keeps its old data, and stops fetching new data).
//
// Additional policy (IMPORTANT): "only last AI message per assistant run"
// ---------------------------------------------------------------------
// - The assistant may emit multiple consecutive AI messages for a single user input
//   (e.g. user, ai, ai, user, ai, user, ai, ai, ai).
// - In that case, we want the inline chip to appear ONLY under the *last* AI message
//   of that consecutive assistant run (i.e., the last AI message before the next human message).
// - This prevents multiple chips for a single logical assistant answer, while preserving the
//   existing "latest-only button + frozen data" behavior on the chip that is rendered.

import {parsePartialJson} from "@langchain/core/output_parsers";
import {useStreamContext} from "@/providers/Stream";
import {AIMessage, Checkpoint, Message} from "@langchain/langgraph-sdk";
import {getContentString} from "../utils";
import {BranchSwitcher, CommandBar} from "./shared";
import {MarkdownText} from "../markdown-text";
import {LoadExternalComponent} from "@langchain/langgraph-sdk/react-ui";
import {cn} from "@/lib/utils";
import {ToolCalls, ToolResult} from "./tool-calls";
import {MessageContentComplex} from "@langchain/core/messages";
import {Fragment} from "react/jsx-runtime";
import {isAgentInboxInterruptSchema} from "@/lib/agent-inbox-interrupt";
import {ThreadView} from "../agent-inbox";
import {useQueryState, parseAsBoolean} from "nuqs";
import {GenericInterruptView} from "./generic-interrupt";
import {useArtifact} from "../artifact";
import AiSourcesInline from "@/components/thread/data-insights/ai-sources-inline";
import {useMemo} from "react";
import {DO_NOT_RENDER_ID_PREFIX} from "@/lib/ensure-tool-responses";

function CustomComponent({
                             message,
                             thread,
                         }: {
    message: Message;
    thread: ReturnType<typeof useStreamContext>;
}) {
    const artifact = useArtifact();
    const {values} = useStreamContext();
    const customComponents = values.ui?.filter(
        (ui) => ui.metadata?.message_id === message.id,
    );

    if (!customComponents?.length) return null;
    return (
        <Fragment key={message.id}>
            {customComponents.map((customComponent) => (
                <LoadExternalComponent
                    key={customComponent.id}
                    stream={thread}
                    message={customComponent}
                    meta={{ui: customComponent, artifact}}
                />
            ))}
        </Fragment>
    );
}

function parseAnthropicStreamedToolCalls(
    content: MessageContentComplex[],
): AIMessage["tool_calls"] {
    const toolCallContents = content.filter((c) => c.type === "tool_use" && c.id);

    return toolCallContents.map((tc) => {
        const toolCall = tc as Record<string, any>;
        let json: Record<string, any> = {};
        if (toolCall?.input) {
            try {
                json = parsePartialJson(toolCall.input) ?? {};
            } catch {
                // Pass
            }
        }
        return {
            name: toolCall.name ?? "",
            id: toolCall.id ?? "",
            args: json,
            type: "tool_call",
        };
    });
}

interface InterruptProps {
    interrupt?: unknown;
    isLastMessage: boolean;
    hasNoAIOrToolMessages: boolean;
}

function Interrupt({
                       interrupt,
                       isLastMessage,
                       hasNoAIOrToolMessages,
                   }: InterruptProps) {
    const fallbackValue = Array.isArray(interrupt)
        ? (interrupt as Record<string, any>[])
        : (((interrupt as { value?: unknown } | undefined)?.value ??
            interrupt) as Record<string, any>);

    return (
        <>
            {isAgentInboxInterruptSchema(interrupt) &&
                (isLastMessage || hasNoAIOrToolMessages) && (
                    <ThreadView interrupt={interrupt}/>
                )}
            {interrupt &&
            !isAgentInboxInterruptSchema(interrupt) &&
            (isLastMessage || hasNoAIOrToolMessages) ? (
                <GenericInterruptView interrupt={fallbackValue}/>
            ) : null}
        </>
    );
}

export function AssistantMessage({
                                     message,
                                     isLoading,
                                     handleRegenerate,
                                 }: {
    message: Message | undefined;
    isLoading: boolean;
    handleRegenerate: (parentCheckpoint: Checkpoint | null | undefined) => void;
}) {
    const content = message?.content ?? [];
    const contentString = getContentString(content);
    const [hideToolCalls] = useQueryState(
        "hideToolCalls",
        parseAsBoolean.withDefault(false),
    );

    /**
     * Context detection (Management vs Public Study).
     *
     * Policy:
     * - Management: allow toggling tool-call visibility via query param/UI toggle.
     * - Public study: tool calls are HARD hidden, regardless of query params.
     */
    const isManagement = useMemo(() => {
        if (typeof window === "undefined") return false;
        return window.location.pathname.startsWith("/management");
    }, []);

    // Public study hard-disable: always hide tool calls + tool result messages.
    const hideToolCallsEffective = isManagement ? (hideToolCalls ?? false) : true;

    const thread = useStreamContext();

    // IMPORTANT: compute "render-relevant" message stream (matches what Thread() actually renders)
    // so helper logic (latest-ai / last-ai-in-run) isn't thrown off by non-rendered placeholders.
    const renderMessages = useMemo(() => {
        return (thread.messages ?? []).filter(
            (m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX),
        );
    }, [thread.messages]);

    const isLastMessage =
        thread.messages[thread.messages.length - 1].id === message?.id;

    const hasNoAIOrToolMessages = !thread.messages.find(
        (m) => m.type === "ai" || m.type === "tool",
    );

    /**
     * Latest AI message detection (for inline Data Insights behavior).
     *
     * IMPORTANT:
     * - We only want the "Explain Data" button on the *latest AI message*.
     * - Older AI messages keep their frozen chip data, but must not keep the button.
     *
     * NOTE:
     * - "Latest AI message" means the last rendered message of type "ai".
     */
    const isLatestAiMessage = useMemo(() => {
        if (!message?.id) return false;
        if (message.type !== "ai") return false;

        const lastAi = [...(renderMessages ?? [])].reverse().find((m) => m.type === "ai");
        const lastAiId = lastAi?.id ? String(lastAi.id) : null;
        return lastAiId === String(message.id);
    }, [message?.id, message?.type, renderMessages]);

    /**
     * "Only last AI message per assistant run" detection.
     *
     * Definition:
     * - Consider the message window from the current AI message forward until the next HUMAN message.
     * - If there is another AI message in that window, this message is NOT the last AI of the run.
     * - Tool messages are ignored for "last AI" purposes (they may occur between AI messages).
     *
     * Why:
     * - If the assistant answers in multiple AI parts, we want exactly one inline chip:
     *   only under the final AI part for that user turn.
     */
    const isLastAiInAssistantRun = useMemo(() => {
        if (!message?.id) return false;
        if (message.type !== "ai") return false;

        const idx = renderMessages.findIndex((m) => String(m.id) === String(message.id));
        if (idx < 0) return false;

        // Find the next human message after this AI message.
        let nextHumanIdx = -1;
        for (let i = idx + 1; i < renderMessages.length; i++) {
            if (renderMessages[i].type === "human") {
                nextHumanIdx = i;
                break;
            }
        }

        const end = nextHumanIdx === -1 ? renderMessages.length : nextHumanIdx;

        // If there's any AI message between (idx+1) and end, we are not the last AI in this run.
        for (let i = idx + 1; i < end; i++) {
            if (renderMessages[i].type === "ai") return false;
        }

        return true;
    }, [message?.id, message?.type, renderMessages]);

    /**
     * Prevent "chip hopping" during the *currently streaming* assistant run:
     * - For older runs (already followed by a human message), we render the chip normally.
     * - For the current run (messages after the last human), we only render the chip once
     *   generation finished (isLoading=false), so it appears exactly once under the final AI message.
     */
    const shouldRenderInlineChip = useMemo(() => {
        if (!message?.id) return false;
        if (message.type !== "ai") return false;
        if (!isLastAiInAssistantRun) return false;

        const idx = renderMessages.findIndex((m) => String(m.id) === String(message.id));
        if (idx < 0) return false;

        // Find last human in the rendered stream. If this AI is after it, it's part of the current run.
        let lastHumanIdx = -1;
        for (let i = renderMessages.length - 1; i >= 0; i--) {
            if (renderMessages[i].type === "human") {
                lastHumanIdx = i;
                break;
            }
        }

        const isInCurrentAssistantRun = idx > lastHumanIdx;

        // For the current run, only show once the run is finished (no streaming).
        if (isInCurrentAssistantRun) return !isLoading;

        // For older runs, always show.
        return true;
    }, [message?.id, message?.type, renderMessages, isLastAiInAssistantRun, isLoading]);

    const meta = message ? thread.getMessagesMetadata(message) : undefined;
    const threadInterrupt = thread.interrupt;

    const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;
    const anthropicStreamedToolCalls = Array.isArray(content)
        ? parseAnthropicStreamedToolCalls(content)
        : undefined;

    const hasToolCalls =
        message &&
        "tool_calls" in message &&
        message.tool_calls &&
        message.tool_calls.length > 0;
    const toolCallsHaveContents =
        hasToolCalls &&
        message.tool_calls?.some(
            (tc) => tc.args && Object.keys(tc.args).length > 0,
        );
    const hasAnthropicToolCalls = !!anthropicStreamedToolCalls?.length;
    const isToolResult = message?.type === "tool";

    // Hard hide tool result messages in public study, optional in management.
    if (isToolResult && hideToolCallsEffective) {
        return null;
    }

    return (
        <div className="group mr-auto flex w-full items-start gap-2">
            <div className="flex w-full flex-col gap-2">
                {isToolResult ? (
                    <>
                        <ToolResult message={message}/>
                        <Interrupt
                            interrupt={threadInterrupt}
                            isLastMessage={isLastMessage}
                            hasNoAIOrToolMessages={hasNoAIOrToolMessages}
                        />
                    </>
                ) : (
                    <>
                        {contentString.length > 0 && (
                            <div className="py-1">
                                <MarkdownText>{contentString}</MarkdownText>
                            </div>
                        )}

                        {/* Tool-call rendering (policy gated via hideToolCallsEffective) */}
                        {!hideToolCallsEffective && (
                            <>
                                {(hasToolCalls && toolCallsHaveContents && (
                                        <ToolCalls toolCalls={message.tool_calls}/>
                                    )) ||
                                    (hasAnthropicToolCalls && (
                                        <ToolCalls toolCalls={anthropicStreamedToolCalls}/>
                                    )) ||
                                    (hasToolCalls && (
                                        <ToolCalls toolCalls={message.tool_calls}/>
                                    ))}
                            </>
                        )}

                        {message && (
                            <CustomComponent
                                message={message}
                                thread={thread}
                            />
                        )}

                        {/* Short data info with explain data button
                            - Chip only on the LAST AI message of a consecutive assistant run
                            - Button only on latest AI message */}
                        {message?.type === "ai" && shouldRenderInlineChip && (
                            <AiSourcesInline
                                messageId={String(message.id)}
                                isLatestAiMessage={isLatestAiMessage}
                            />
                        )}

                        <Interrupt
                            interrupt={threadInterrupt}
                            isLastMessage={isLastMessage}
                            hasNoAIOrToolMessages={hasNoAIOrToolMessages}
                        />
                        <div
                            className={cn(
                                "mr-auto flex items-center gap-2 transition-opacity",
                                "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
                            )}
                        >
                            <BranchSwitcher
                                branch={meta?.branch}
                                branchOptions={meta?.branchOptions}
                                onSelect={(branch) => thread.setBranch(branch)}
                                isLoading={isLoading}
                            />
                            <CommandBar
                                content={contentString}
                                isLoading={isLoading}
                                isAiMessage={true}
                                handleRegenerate={() => handleRegenerate(parentCheckpoint)}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export function AssistantMessageLoading() {
    return (
        <div className="mr-auto flex items-start gap-2">
            <div className="bg-muted flex h-8 items-center gap-1 rounded-2xl px-4 py-2">
                <div
                    className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full"></div>
                <div
                    className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_0.5s_infinite] rounded-full"></div>
                <div
                    className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_1s_infinite] rounded-full"></div>
            </div>
        </div>
    );
}
