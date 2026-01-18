/**
 * Path: app/modules/langgraph/agents/tavilyAgent/tools.ts
 *
 * WHY "fetch" TOOL IMPLEMENTATION:
 * -------------------------------
 * We implement Tavily via fetch to avoid dependency churn in wrappers.
 * This also makes debugging super clear: request in, response out.
 */

import {tool} from "@langchain/core/tools";
import {z} from "zod";

function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) {
        throw new Error(
            `[tavilyAgent/tools] Missing required env var "${name}". Add it to the repo root .env.`,
        );
    }
    return v;
}

type TavilyResponse = {
    answer?: string;
    results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        score?: number;
    }>;
};

/**
 * Small timeout helper because tool calls should not hang forever.
 */
function withTimeout(ms: number) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return {signal: controller.signal, done: () => clearTimeout(id)};
}

export const webSearch = tool(
    async ({query, maxResults}) => {
        const apiKey = requireEnv("TAVILY_API_KEY");

        const timeout = withTimeout(25_000);
        try {
            const res = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                },
                signal: timeout.signal,
                body: JSON.stringify({
                    query,
                    max_results: maxResults ?? 5,
                    include_answer: true,
                    include_raw_content: false,
                }),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(
                    `[tavilyAgent/web_search] Tavily API error: ${res.status} ${res.statusText}\n${text}`,
                );
            }

            const data = (await res.json()) as TavilyResponse;

            // Compact output => easy for the model to read and cite.
            return JSON.stringify(
                {
                    answer: data.answer ?? null,
                    results: (data.results ?? []).map((r) => ({
                        title: r.title ?? null,
                        url: r.url ?? null,
                        snippet: r.content ?? null,
                        score: r.score ?? null,
                    })),
                },
                null,
                2,
            );
        } finally {
            timeout.done();
        }
    },
    {
        name: "web_search",
        description:
            "Search the web (Tavily) for up-to-date information. Input is a plain search query.",
        schema: z.object({
            query: z.string().min(3).describe("The search query"),
            maxResults: z.number().int().min(1).max(10).optional(),
        }),
    },
);

export const TOOLS = [webSearch];
