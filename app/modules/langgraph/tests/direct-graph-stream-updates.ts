/**
 * Path: app/modules/langgraph/tests/direct-graph-stream-updates.ts
 *
 * Streams the graph directly and prints what streamMode="updates" yields.
 *
 * Run:
 *   pnpm tsx app/modules/langgraph/tests/direct-graph-stream-updates.ts
 */

import "dotenv/config";

import {HumanMessage} from "@langchain/core/messages";
import {getGraph} from "../agents/tavilyAgent/graph.js";
import {buildRunnableConfig} from "../agents/tavilyAgent/configuration.js";

function env(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`[direct-graph-stream-updates] Missing env var: ${name}`);
    return v;
}

async function main() {
    env("LANGGRAPH_POSTGRES_URL");
    env("OPENAI_API_KEY");
    env("TAVILY_API_KEY");

    const threadId = `test-stream-updates-${Date.now()}`;
    const config = buildRunnableConfig({threadId});

    const graph = await getGraph();

    console.log("=== Direct Graph Stream (updates) ===");
    console.log("threadId:", threadId);
    console.log("");

    const input = {
        messages: [new HumanMessage("Say 'ok'. Do NOT call tools.")],
    };

    for await (const chunk of await graph.stream(input, {...config, streamMode: "updates"})) {
        console.log("CHUNK:", JSON.stringify(chunk, null, 2));
    }

    console.log("\n✅ Stream finished.");
}

main().catch((err) => {
    console.error("\n[FATAL]", err);
    process.exitCode = 1;
});
