/**
 * Path: app/modules/langgraph/agents/tavilyAgent/graph.ts
 *
 * THIS IS THE HEART OF YOUR AGENT.
 *
 * Goals:
 * - A clean ReAct-style loop (LLM -> tools -> LLM -> ... -> end)
 * - Postgres checkpointing that NEVER races (tables exist before first run)
 * - A single entrypoint: getGraph()
 *
 * WHY NOT setup() inside callModel?
 * - LangGraph may touch the checkpointer BEFORE any node runs (loop initialization).
 * - If tables do not exist then => "relation public.checkpoints does not exist".
 *
 * Therefore:
 * - We provide getGraph() which ensures setup() is finished before returning the graph.
 *
 * OPTION A (NEW):
 * - Multiple graphs/agents can share ONE Postgres database safely by using
 *   DIFFERENT SCHEMAS per agent (separate tables per agent).
 * - This avoids collisions even if thread IDs accidentally overlap.
 * - Configure the schema via LANGGRAPH_POSTGRES_SCHEMA (optional).
 */

import "dotenv/config";

import {AIMessage} from "@langchain/core/messages";
import {RunnableConfig} from "@langchain/core/runnables";
import {MessagesAnnotation, StateGraph} from "@langchain/langgraph";
import {ToolNode} from "@langchain/langgraph/prebuilt";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";

import {ConfigurationSchema, ensureConfiguration} from "./configuration.js";
import {TOOLS} from "./tools.js";
import {loadChatModel} from "./utils.js";

/**
 * Small env helper: fail-fast.
 * If DB url is missing, we want a loud crash immediately.
 */
function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) {
        throw new Error(
            `[tavilyAgent/graph] Missing required env var "${name}". Put it in repo root .env`,
        );
    }
    return v;
}

/**
 * Optional env helper: default fallback.
 * We use this for the Postgres schema to support Option A (per-agent schema).
 */
function envOrDefault(name: string, fallback: string): string {
    const v = process.env[name]?.trim();
    return v && v.length > 0 ? v : fallback;
}

/**
 * Enforce safe schema names (identifiers) so we only ever accept simple identifiers.
 * Keep it simple: letters, digits, underscore.
 */
function assertSafeSchemaName(schema: string): string {
    const s = schema.trim();
    if (!/^[A-Za-z0-9_]+$/.test(s)) {
        throw new Error(
            `[tavilyAgent/graph] Unsafe Postgres schema name "${schema}". ` +
            `Allowed: letters, digits, underscore.`,
        );
    }
    return s;
}

/**
 * CHECKPOINTER SINGLETON:
 * - One PostgresSaver instance per process is correct.
 * - The tricky part is: setup() must happen before first invoke/stream.
 *
 * OPTION A (NEW):
 * - We set a dedicated schema for this agent.
 * - This allows multiple agents/graphs to share the same DB without table collisions.
 * - Each agent should use its own schema value.
 */
const postgresUrl = requireEnv("LANGGRAPH_POSTGRES_URL");

/**
 * Default schema for THIS agent.
 * You can override it via LANGGRAPH_POSTGRES_SCHEMA, e.g.:
 * - tavily agent: LANGGRAPH_POSTGRES_SCHEMA=lg_tavily_agent
 * - my agent:     LANGGRAPH_POSTGRES_SCHEMA=lg_my_agent
 * - other agent:  LANGGRAPH_POSTGRES_SCHEMA=lg_other_agent
 *
 * Additionally (NEW):
 * - For multi-agent repos, prefer a dedicated env var per agent:
 *   LANGGRAPH_POSTGRES_SCHEMA_TAVILY=...
 * This file will prefer LANGGRAPH_POSTGRES_SCHEMA_TAVILY when present.
 */
const postgresSchema = assertSafeSchemaName(
    envOrDefault(
        "LANGGRAPH_POSTGRES_SCHEMA_TAVILY",
        envOrDefault("LANGGRAPH_POSTGRES_SCHEMA", "lg_tavily_agent"),
    ),
);

const checkpointer = PostgresSaver.fromConnString(postgresUrl, {
    schema: postgresSchema,
});

/**
 * Setup memoization:
 * - ensures checkpointer.setup() runs exactly once
 * - prevents concurrency races (multiple calls await same promise)
 */
let setupPromise: Promise<void> | null = null;

async function ensurePostgresReady(): Promise<void> {
    if (!setupPromise) {
        setupPromise = (async () => {
            console.log("[tavilyAgent] Postgres URL:", postgresUrl.slice(0, 48) + "…");
            console.log("[tavilyAgent] Postgres schema:", postgresSchema);
            console.log("[tavilyAgent] Running checkpointer.setup() (creating tables) …");

            // NOTE:
            // We intentionally do NOT import/use "pg" here.
            // PostgresSaver.setup() is responsible for creating required tables.
            // If your DB user cannot CREATE SCHEMA, create it once manually.
            await checkpointer.setup();

            console.log("[tavilyAgent] Checkpointer setup complete.");
        })();
    }
    await setupPromise;
}

/**
 * For logging message input
 * */
function summarizeContentBlock(block: any) {
    if (!block || typeof block !== "object") return block;

    // Hide huge base64 payloads but keep shape
    const copy: any = {...block};

    if (typeof copy.data === "string") {
        copy.data = `<base64 len=${copy.data.length}>`;
    }
    if (copy.file && typeof copy.file === "object") {
        // don't dump binary
        copy.file = {...copy.file};
        if (typeof copy.file.data === "string") {
            copy.file.data = `<base64 len=${copy.file.data.length}>`;
        }
    }
    return copy;
}

function summarizeMessage(msg: any) {
    const base: any = {
        type: msg?.type ?? msg?.role ?? "unknown",
        id: msg?.id,
    };

    const content = msg?.content;

    if (typeof content === "string") {
        base.content = `<text len=${content.length}>`;
        return base;
    }

    if (Array.isArray(content)) {
        base.content = content.map((b: any) => summarizeContentBlock(b));
        return base;
    }

    base.content = content;
    return base;
}

/**
 * NODE: callModel
 * - reads runtime config
 * - loads chat model
 * - binds tools
 * - returns the next AI message
 */
async function callModel(
    state: typeof MessagesAnnotation.State,
    config: RunnableConfig,
): Promise<typeof MessagesAnnotation.Update> {
    const configuration = ensureConfiguration(config);

    const systemPrompt = configuration.systemPromptTemplate.replace(
        "{system_time}",
        new Date().toISOString(),
    );

    const model = (await loadChatModel(configuration.model)).bindTools(TOOLS);

    // --- DEBUG START ---
    const last = state.messages[state.messages.length - 1];
    console.log("[tavilyAgent/callModel] thread_id:", configuration.thread_id);
    console.log("[tavilyAgent/callModel] model:", configuration.model);
    console.log("[tavilyAgent/callModel] postgres_schema:", postgresSchema);

    console.log(
        "[tavilyAgent/callModel] last message (summary): (",
        JSON.stringify(summarizeMessage(last), null, 2),
        ")",
    );

    // show if any multimodal blocks exist and what keys they have
    if (last && Array.isArray((last as any).content)) {
        const blocks = (last as any).content;
        console.log(
            "[tavilyAgent/callModel] content block keys:",
            blocks.map((b: any) => ({
                type: b?.type,
                keys: b ? Object.keys(b).sort() : [],
                mimeType: b?.mimeType,
                mime_type: b?.mime_type,
                source_type: b?.source_type,
            })),
        );
    }
    // --- DEBUG END ---

    const response = await model.invoke([
        {role: "system", content: systemPrompt},
        ...state.messages,
    ]);

    return {messages: [response]};
}

/**
 * ROUTER:
 * - if the last AI message contains tool calls => execute tools
 * - else => end
 */
function routeModelOutput(state: typeof MessagesAnnotation.State): string {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    return (last?.tool_calls?.length ?? 0) > 0 ? "tools" : "__end__";
}

/**
 * Build workflow (ReAct loop):
 * start -> callModel -> (tools?) -> callModel -> ... -> end
 */
const workflow = new StateGraph(MessagesAnnotation, ConfigurationSchema)
    .addNode("callModel", callModel)
    .addNode("tools", new ToolNode(TOOLS))
    .addEdge("__start__", "callModel")
    .addConditionalEdges("callModel", routeModelOutput)
    .addEdge("tools", "callModel");

/**
 * The compiled graph can be exported,
 * BUT you MUST ensure Postgres tables exist before first use.
 */
export const graph = workflow.compile({checkpointer});

/**
 * SAFE ASYNC ENTRYPOINT:
 * - ensures Postgres tables exist
 * - returns the compiled graph
 *
 * This is what your tests and API layer should call.
 */
let graphPromise: Promise<typeof graph> | null = null;

export async function getGraph(): Promise<typeof graph> {
    if (!graphPromise) {
        graphPromise = (async () => {
            await ensurePostgresReady();
            return graph;
        })();
    }
    return graphPromise;
}
