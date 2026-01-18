/**
 * Path: app/modules/langgraph/agents/tavilyAgent/configuration.ts
 *
 * THIS FILE IS ALL ABOUT RUNTIME CONFIGURATION.
 *
 * The most important part is `thread_id`.
 * - LangGraph checkpointing is keyed by thread_id.
 * - No thread_id => no persisted conversation state.
 *
 * We enforce thread_id hard (fail-fast) because silent "temporary runs" are pain.
 *
 * NOTE (OPTION A):
 * - If you run multiple graphs/agents against one Postgres database,
 *   prefer giving each agent its own Postgres schema (separate tables).
 * - In that setup, thread_id being UUID is still a great idea,
 *   but schema separation prevents any accidental cross-graph mixing.
 */

import {Annotation} from "@langchain/langgraph";
import {RunnableConfig} from "@langchain/core/runnables";
import {SYSTEM_PROMPT_TEMPLATE} from "./prompts.js";

export const ConfigurationSchema = Annotation.Root({
    systemPromptTemplate: Annotation<string>,
    model: Annotation<string>,
    thread_id: Annotation<string>,
});

export type AgentConfigurable = typeof ConfigurationSchema.State;

/**
 * Normalize + validate config.
 * This is used inside graph nodes.
 */
export function ensureConfiguration(config: RunnableConfig): AgentConfigurable {
    const c = (config.configurable ?? {}) as Partial<AgentConfigurable>;

    const threadId = c.thread_id?.trim();
    if (!threadId) {
        throw new Error(
            `[tavilyAgent/configuration] Missing configurable.thread_id. ` +
            `You MUST pass a thread_id on every invoke/stream call for Postgres checkpointing.`,
        );
    }

    // Default model: prefer a global env default (shared across agents),
    // fallback to GPT-5.1 for this repo.
    const defaultModel =
        (process.env.LANGGRAPH_DEFAULT_MODEL ?? "openai/gpt-5.1").trim();

    const model = (c.model ?? defaultModel).trim();
    if (!model) {
        throw new Error(
            `[tavilyAgent/configuration] configurable.model is empty. ` +
            `Use e.g. "openai/gpt-5.1".`,
        );
    }

    return {
        systemPromptTemplate: c.systemPromptTemplate ?? SYSTEM_PROMPT_TEMPLATE,
        model,
        thread_id: threadId,
    };
}

/**
 * TS-safe helper for callers (tests, API routes).
 * Always fills every required key so TypeScript stays quiet and runtime is correct.
 */
export function buildRunnableConfig(args: {
    threadId: string;
    model?: string;
    systemPromptTemplate?: string;
}): RunnableConfig<AgentConfigurable> {
    const threadId = args.threadId.trim();
    if (!threadId) {
        throw new Error("[tavilyAgent/configuration] buildRunnableConfig(): threadId is empty.");
    }

    // Default model: prefer a global env default (shared across agents),
    // fallback to GPT-5.1 for this repo.
    const defaultModel =
        (process.env.LANGGRAPH_DEFAULT_MODEL ?? "openai/gpt-5.1").trim();

    return {
        configurable: {
            thread_id: threadId,
            model: (args.model ?? defaultModel).trim(),
            systemPromptTemplate: args.systemPromptTemplate ?? SYSTEM_PROMPT_TEMPLATE,
        },
    };
}
