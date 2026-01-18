// Path: app/modules/langgraph/agents/dataAwareLLMSystem/utils/load-chat-model.ts
//
// Small wrapper around LangChain universal initChatModel.
// Matches the tavilyAgent pattern.

import {initChatModel} from "langchain/chat_models/universal";

export async function loadChatModel(fullySpecifiedName: string) {
    const raw = (fullySpecifiedName ?? "").trim();
    if (!raw) {
        throw new Error(
            `[dataAwareLLMSystem/utils] Model string is empty. Use e.g. "openai/gpt-5.1".`,
        );
    }

    // Accept:
    //  - "openai/gpt-5.1"  (repo style)
    //  - "openai:gpt-5.1"  (docs style)
    const normalized = raw.includes("/") ? raw.replace("/", ":") : raw;

    try {
        return await initChatModel(normalized);
    } catch (err: any) {
        const msg = String(err?.message ?? err);
        throw new Error(
            `[dataAwareLLMSystem/utils] Failed to initChatModel("${normalized}").\n` +
            `Common cause: missing provider integration package.\n` +
            `For OpenAI install: pnpm add @langchain/openai\n\n` +
            `Original error: ${msg}`,
        );
    }
}
