// Path: app/modules/langgraph/agents/dataAwareLLMSystem/configuration.ts
//
// Runtime configuration: thread_id + model + main system prompt template.
// Mirrors tavilyAgent pattern.

import {Annotation} from "@langchain/langgraph";
import {RunnableConfig} from "@langchain/core/runnables";
import {SYSTEM_PROMPT_TEMPLATE} from "./prompts.js";

export const ConfigurationSchema = Annotation.Root({
    systemPromptTemplate: Annotation<string>,
    model: Annotation<string>,
    thread_id: Annotation<string>,
});

export type AgentConfigurable = typeof ConfigurationSchema.State;

export function ensureConfiguration(config: RunnableConfig): AgentConfigurable {
    const c = (config.configurable ?? {}) as Partial<AgentConfigurable>;

    const threadId = c.thread_id?.trim();
    if (!threadId) {
        throw new Error(
            `[dataAwareLLMSystem/configuration] Missing configurable.thread_id. ` +
            `You MUST pass a thread_id on every invoke/stream call for Postgres checkpointing.`,
        );
    }

    const defaultModel = (process.env.LANGGRAPH_DEFAULT_MODEL ?? "openai/gpt-5.1").trim();
    const model = (c.model ?? defaultModel).trim();
    if (!model) {
        throw new Error(
            `[dataAwareLLMSystem/configuration] configurable.model is empty. Use e.g. "openai/gpt-5.1".`,
        );
    }

    return {
        systemPromptTemplate: c.systemPromptTemplate ?? SYSTEM_PROMPT_TEMPLATE,
        model,
        thread_id: threadId,
    };
}

export function buildRunnableConfig(args: {
    threadId: string;
    model?: string;
    systemPromptTemplate?: string;
}): RunnableConfig<AgentConfigurable> {
    const threadId = args.threadId.trim();
    if (!threadId) {
        throw new Error("[dataAwareLLMSystem/configuration] buildRunnableConfig(): threadId is empty.");
    }

    const defaultModel = (process.env.LANGGRAPH_DEFAULT_MODEL ?? "openai/gpt-5.1").trim();

    return {
        configurable: {
            thread_id: threadId,
            model: (args.model ?? defaultModel).trim(),
            systemPromptTemplate: args.systemPromptTemplate ?? SYSTEM_PROMPT_TEMPLATE,
        },
    };
}
