/**
 * Path: app/modules/langgraph/tests/direct-graph-checkpoint.ts
 *
 * Verifies:
 * - Postgres checkpointer tables exist
 * - state is persisted for a given thread_id
 * - getState() / getStateHistory() return snapshots
 *
 * Run:
 *   pnpm tsx app/modules/langgraph/tests/direct-graph-checkpoint.ts
 */

import "dotenv/config";

import {HumanMessage} from "@langchain/core/messages";
import {getGraph} from "../agents/tavilyAgent/graph.js";
import {buildRunnableConfig} from "../agents/tavilyAgent/configuration.js";

function env(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`[direct-graph-checkpoint] Missing env var: ${name}`);
    return v;
}

async function main() {
    env("LANGGRAPH_POSTGRES_URL");
    env("OPENAI_API_KEY");
    env("TAVILY_API_KEY");

    const threadId = `test-thread-${Date.now()}`;
    const config = buildRunnableConfig({threadId});

    const graph = await getGraph();

    console.log("=== Direct Graph + Postgres Checkpointer Test ===");
    console.log("threadId:", threadId);
    console.log("");

    console.log("-> invoke #1");
    const out1 = await graph.invoke(
        {messages: [new HumanMessage("Hello! Just say 'ok' and do NOT call tools.")]},
        config,
    );
    console.log("invoke #1 done. last message:");
    console.log(out1.messages[out1.messages.length - 1]);
    console.log("");

    console.log("-> invoke #2 (same thread_id => history should grow)");
    const out2 = await graph.invoke(
        {
            messages: [
                new HumanMessage(
                    "Now please use web_search to find the official LangGraph documentation homepage and include the URL.",
                ),
            ],
        },
        config,
    );
    console.log("invoke #2 done. last message:");
    console.log(out2.messages[out2.messages.length - 1]);
    console.log("");

    console.log("-> getState()");
    const state = await graph.getState(config);
    console.log({
        valuesKeys: Object.keys(state.values ?? {}),
        next: state.next ?? null,
    });
    console.log("");

    console.log("-> getStateHistory()");
    let count = 0;
    for await (const snap of graph.getStateHistory(config)) {
        count += 1;
        if (count <= 3) {
            console.log(`[history #${count}]`, {
                valuesKeys: Object.keys(snap.values ?? {}),
                next: snap.next ?? null,
            });
        }
    }

    console.log("\nHistory snapshots total:", count);

    if (count === 0) {
        throw new Error("No checkpoints found. This would indicate: thread_id missing or DB not used.");
    }

    console.log("\n✅ SUCCESS: state + history were persisted in Postgres.");
}

main().catch((err) => {
    console.error("\n[FATAL]", err);
    process.exitCode = 1;
});
