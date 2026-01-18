/**
 * Path: app/modules/langgraph/agents/tavilyAgent/utils.ts
 *
 * Model loader for LangChain "universal" init.
 *
 * CRITICAL NOTE:
 * - The provider integration package must be installed (e.g. @langchain/openai).
 * - If it's missing, LangChain can throw confusing errors.
 *
 * We convert those into actionable messages.
 */

import {initChatModel} from "langchain/chat_models/universal";

export async function loadChatModel(fullySpecifiedName: string) {
    const raw = (fullySpecifiedName ?? "").trim();
    if (!raw) {
        throw new Error(`[tavilyAgent/utils] Model string is empty. Use e.g. "openai/gpt-4o-mini".`);
    }

    // Accept both formats:
    //  - "openai/gpt-4o-mini"  (your style)
    //  - "openai:gpt-4o-mini"  (docs style)
    const normalized = raw.includes("/") ? raw.replace("/", ":") : raw;

    try {
        // initChatModel supports "provider:model" and also needs provider packages installed.
        return await initChatModel(normalized);
    } catch (err: any) {
        const msg = String(err?.message ?? err);

        // Make the most common failure actionable:
        // Missing provider integration package (OpenAI => @langchain/openai)
        throw new Error(
            `[tavilyAgent/utils] Failed to initChatModel("${normalized}").\n` +
            `Common cause: missing provider integration package.\n` +
            `For OpenAI install: pnpm add @langchain/openai\n\n` +
            `Original error: ${msg}`,
        );
    }
}
