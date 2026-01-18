/**
 * Path: app/modules/langgraph/tests/direct-graph-stream-debug.ts
 *
 * Streams the graph directly in the most verbose mode (debug).
 *
 * Run:
 *   pnpm tsx app/modules/langgraph/tests/direct-graph-stream-debug.ts
 */

import "dotenv/config";

import {HumanMessage} from "@langchain/core/messages";
import {getGraph} from "../agents/tavilyAgent/graph.js";
import {buildRunnableConfig} from "../agents/tavilyAgent/configuration.js";

function env(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`[direct-graph-stream-debug] Missing env var: ${name}`);
    return v;
}

async function main() {
    env("LANGGRAPH_POSTGRES_URL");
    env("OPENAI_API_KEY");
    env("TAVILY_API_KEY");

    const threadId = `test-stream-debug-${Date.now()}`;
    const config = buildRunnableConfig({threadId});

    const graph = await getGraph();

    console.log("=== Direct Graph Stream (debug) ===");
    console.log("threadId:", threadId);
    console.log("");

    const input = {
        messages: [
            new HumanMessage("Use web_search to find the official LangGraph documentation homepage and include the URL."),
        ],
    };

    for await (const chunk of await graph.stream(input, {...config, streamMode: "debug"})) {
        console.log("DEBUG-CHUNK:", JSON.stringify(chunk, null, 2));
    }

    console.log("\n✅ Debug stream finished.");
}

main().catch((err) => {
    console.error("\n[FATAL]", err);
    process.exitCode = 1;
});
