/**
 * Path: app/modules/langgraph/agents/dataAwareLLMSystem/graph.ts
 *
 * Data-Aware-LLM-System
 * =================================================
 *
 * Ziel dieses Agents:
 * -------------------
 * 1) MAIN ASSISTANT (user-visible):
 *    - Lädt/kennt das Dataset-Schema (Introspection Summary).
 *    - Darf mehrere READ-ONLY SQL Queries ausführen (ReAct Loop).
 *    - Generiert daraus die finale Antwort im Chat.
 *    - WICHTIG (Study-Regel): Der Main Assistant darf NICHT kommentieren,
 *      ob Zeitabdeckung/Timeliness passt oder Lücken existieren.
 *
 * 2) DQ PASS (nicht user-visible):
 *    - Läuft IM SELBEN Graph-Run direkt NACH der finalen Antwort.
 *    - Sieht: user_question + alle ausgeführten SQLs + schema summary.
 *    - Baut eine Coverage-Query, die Timeline Coverage und Lücken prüft
 *      (nicht nur MIN/MAX, sondern auch fehlende Jahre/Monate).
 *    - Persistiert pro User-Turn genau EINEN Eintrag (append-only)
 *      in die App-DB (Prisma), verknüpft über thread_id (LangGraphThreadId).
 *    - Speichert außerdem usedTables (Union aus allen SQLs).
 *
 * Warum "alle SQLs" und nicht nur "die letzte"?
 * ---------------------------------------------
 * Timeliness muss auf dem tatsächlich verwendeten Datenpool basieren.
 * In ReAct können mehrere SQLs Teil der Antwortbildung sein:
 * - Vorab: Lookup/Dimensionen
 * - Dann: Fakten/Filter/Join
 * - Dann: Aggregation/Validierung
 * => Der DQ-Pass muss die gesamte Menge der verwendeten Daten berücksichtigen,
 *    nicht nur die letzte Query.
 *
 * IMPORTANT:
 * - Der DQ-Output wird NICHT als Chat-Message gespeichert/angezeigt.
 * - Der DQ-Pass kann selbst SQL Queries ausführen (read-only), um Coverage zu messen.
 */

import "dotenv/config";

import {AIMessage, ToolMessage} from "@langchain/core/messages";
import {RunnableConfig} from "@langchain/core/runnables";
import {MessagesAnnotation, StateGraph} from "@langchain/langgraph";
import {ToolNode} from "@langchain/langgraph/prebuilt";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";

import {ConfigurationSchema, ensureConfiguration} from "./configuration.js";
import {TOOLS} from "./tools/index.js";
import {loadChatModel} from "./utils/load-chat-model.js";
import {getDatasetSchemaSummary} from "./utils/get-dataset-schema-summary.js";
import {extractUsedTables} from "./utils/extract-used-tables.js";
import {DQ_SYSTEM_PROMPT_TEMPLATE, SYSTEM_PROMPT_TEMPLATE} from "./prompts.js";
import {writeThreadDqLog} from "./persist/write-thread-dq-log.js";
import {sqlQuery} from "./tools/sql-query.js";

/** ---------- env helpers (same style as tavilyAgent) ---------- */

function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) {
        throw new Error(
            `[dataAwareLLMSystem/graph] Missing required env var "${name}". Put it in repo root .env`,
        );
    }
    return v;
}

function envOrDefault(name: string, fallback: string): string {
    const v = process.env[name]?.trim();
    return v && v.length > 0 ? v : fallback;
}

function assertSafeSchemaName(schema: string): string {
    const s = schema.trim();
    if (!/^[A-Za-z0-9_]+$/.test(s)) {
        throw new Error(
            `[dataAwareLLMSystem/graph] Unsafe Postgres schema name "${schema}". Allowed: letters, digits, underscore.`,
        );
    }
    return s;
}

/** ---------- Checkpointer singleton + setup (best practice) ---------- */

const postgresUrl = requireEnv("LANGGRAPH_POSTGRES_URL");

const postgresSchema = assertSafeSchemaName(
    envOrDefault(
        "LANGGRAPH_POSTGRES_SCHEMA_DATA_AWARE",
        envOrDefault("LANGGRAPH_POSTGRES_SCHEMA", "lg_data_aware_llm_system"),
    ),
);

const checkpointer = PostgresSaver.fromConnString(postgresUrl, {schema: postgresSchema});

let setupPromise: Promise<void> | null = null;

async function ensurePostgresReady(): Promise<void> {
    if (!setupPromise) {
        setupPromise = (async () => {
            console.log("[dataAwareLLMSystem] Postgres URL:", postgresUrl.slice(0, 48) + "…");
            console.log("[dataAwareLLMSystem] Postgres schema:", postgresSchema);
            console.log("[dataAwareLLMSystem] Running checkpointer.setup() …");
            await checkpointer.setup();
            console.log("[dataAwareLLMSystem] Checkpointer setup complete.");
        })();
    }
    await setupPromise;
}

/** ---------- helper: extract SQL tool calls from message history ---------- */

/**
 * Collect ALL sql_query calls (read-only tool) from the conversation state.
 * We intentionally keep ALL queries because DQ must evaluate the full used-data footprint.
 */
function getAllSqlCalls(messages: any[]): string[] {
    const sqls: string[] = [];
    for (const m of messages) {
        const calls = (m as any)?.tool_calls ?? [];
        for (const c of calls) {
            if (c?.name === "sql_query" && c?.args?.sql) {
                sqls.push(String(c.args.sql));
            }
        }
    }
    return sqls;
}

/**
 * Convenience: last sql_query executed by the main assistant (useful for auditing).
 * DQ evaluation still uses ALL sqls, but mainSql helps debugging and later analysis.
 */
function getLastSqlCall(messages: any[]): string | null {
    const all = getAllSqlCalls(messages);
    return all.length > 0 ? all[all.length - 1] : null;
}

/**
 * Collect used table names from ALL SQLs.
 * This is a "best effort" parser (extractUsedTables) and used for metadata/audit.
 */
function unionUsedTables(sqls: string[]): string[] {
    const out = new Set<string>();
    for (const s of sqls) {
        for (const t of extractUsedTables(s)) out.add(t);
    }
    return [...out].sort();
}

/**
 * Get the final, user-visible assistant answer from the message history.
 *
 * Why:
 * - The DQ pass should be able to see what the main assistant actually answered (audit context),
 *   in addition to the SQL footprint that drove the answer.
 * - This aligns with DQ_SYSTEM_PROMPT_TEMPLATE which can receive main_assistant_answer (optional).
 *
 * Notes:
 * - We scan backwards and pick the last assistant/AI message with non-empty content.
 * - Tool messages (role/type "tool") are ignored.
 */
function getLastAssistantAnswer(messages: any[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m: any = messages[i];
        const role = String(m?.role ?? "").toLowerCase();
        const type = String(m?.type ?? "").toLowerCase();
        const content = String(m?.content ?? "").trim();
        if (!content) continue;

        const isTool = role === "tool" || type === "tool";
        if (isTool) continue;

        const isAssistant = role === "assistant" || type === "ai";
        if (!isAssistant) continue;

        return content;
    }
    return null;
}

/**
 * Build the DQ "user_question" context from ALL user messages in the thread.
 *
 * Why:
 * - If the assistant asks clarifying questions, the last user message may only contain
 *   a partial answer (e.g., "Adidas") while the timeframe was specified earlier (e.g., "2018").
 * - The DQ pass should therefore see the full user conversation context to infer timeframe
 *   reliably without guessing.
 *
 * Format:
 * - We join all user messages in chronological order using an explicit separator.
 * - The separator is intended to be obvious and robust for the DQ model.
 */
function getAllUserMessagesJoined(messages: any[]): string {
    const parts: string[] = [];
    for (const m of messages) {
        if ((m as any)?.role === "user") {
            parts.push(String((m as any)?.content ?? "").trim());
        }
    }

    // Obvious, explicit delimiter between user turns
    const SEP = "\n\n--- USER MESSAGE ---\n\n";

    // Avoid returning empty/whitespace-only payloads
    return parts.filter((p) => p.length > 0).join(SEP).trim();
}

/**
 * Build a full chat transcript (USER + ASSISTANT) for the DQ pass.
 *
 * Why:
 * - User may specify timeframe in one message and entity/indicator in a later message.
 * - If DQ only sees the last user message, it can lose the timeframe and incorrectly mark NOT_EVALUATED.
 * - By providing the full transcript (like the main assistant sees), DQ can infer the intended timeframe
 *   from earlier turns without guessing.
 *
 * Format:
 * - English wrappers/markers for robustness (as requested), while preserving the original message text.
 */
function getChatTranscript(messages: any[]): string {
    const lines: string[] = [];

    lines.push("BEGIN CHAT HISTORY");

    for (const m of messages) {
        const role = String((m as any)?.role ?? "").toLowerCase();
        const type = String((m as any)?.type ?? "").toLowerCase();
        const content = String((m as any)?.content ?? "").trim();
        if (!content) continue;

        // We include USER + ASSISTANT only (as requested).
        // We treat both role/type variants defensively.
        const isUser = role === "user" || type === "human";
        const isAssistant = role === "assistant" || type === "ai";

        if (!isUser && !isAssistant) continue;

        const label = isUser ? "USER" : "ASSISTANT";
        lines.push("");
        lines.push("---");
        lines.push(`[${label}]`);
        lines.push(content);
    }

    lines.push("");
    lines.push("END CHAT HISTORY");

    return lines.join("\n").trim();
}

/**
 * Build the same chat transcript as a structured array for the DQ pass.
 *
 * Why:
 * - Some models parse JSON arrays more reliably than long concatenated strings.
 * - This also allows the DQ prompt to refer to "the full chat" without any ambiguity.
 *
 * Notes:
 * - We include USER + ASSISTANT only (as requested).
 * - We preserve message content as-is.
 */
function getChatHistoryObjects(messages: any[]): Array<{ role: "user" | "assistant"; content: string }> {
    const out: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const m of messages) {
        const role = String((m as any)?.role ?? "").toLowerCase();
        const type = String((m as any)?.type ?? "").toLowerCase();
        const content = String((m as any)?.content ?? "").trim();
        if (!content) continue;

        const isUser = role === "user" || type === "human";
        const isAssistant = role === "assistant" || type === "ai";
        if (!isUser && !isAssistant) continue;

        out.push({role: isUser ? "user" : "assistant", content});
    }

    return out;
}

/** ---------- NODE: callModel (main assistant; user-visible output) ---------- */

/**
 * MAIN ASSISTANT NODE:
 * - Loads dataset schema summary.
 * - Builds system prompt = template + schema.
 * - Runs ReAct model with TOOLS (sql_query, etc.).
 * - Returns ONE AI message to the main state (visible to user).
 */
async function callModel(
    state: typeof MessagesAnnotation.State,
    config: RunnableConfig,
): Promise<typeof MessagesAnnotation.Update> {
    const configuration = ensureConfiguration(config);

    // 1) Schema summary for this run (cache/utility function decides how it caches).
    const datasetSchema = await getDatasetSchemaSummary();

    // 2) Use configurable prompt if provided, otherwise fallback to SYSTEM_PROMPT_TEMPLATE.
    //    This also ensures SYSTEM_PROMPT_TEMPLATE is a real dependency (no "unused constant").
    const promptTemplate = (configuration.systemPromptTemplate ?? SYSTEM_PROMPT_TEMPLATE);

    const systemPrompt = promptTemplate
        .replace("{system_time}", new Date().toISOString())
        .replace("{dataset_schema}", datasetSchema);

    // 3) ReAct model can call tools multiple times (read-only SQL).
    const model = (await loadChatModel(configuration.model)).bindTools(TOOLS);

    const response = await model.invoke([{role: "system", content: systemPrompt}, ...state.messages]);

    return {messages: [response]};
}

/** ---------- ROUTER: ReAct tools loop ---------- */

/**
 * If the last AI message has tool calls -> run ToolNode.
 * Otherwise -> the main assistant is done, we proceed to dq_pass.
 */
function routeModelOutput(state: typeof MessagesAnnotation.State): string {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    return (last?.tool_calls?.length ?? 0) > 0 ? "tools" : "dq_pass";
}

/** ---------- NODE: dq_pass (second system; NOT shown in chat) ---------- */

/**
 * DQ PASS NODE:
 * - Runs after the main assistant produced its final answer.
 * - It does NOT append anything to state.messages (no user-visible output).
 * - It always persists exactly one DQ log row per user turn:
 *   - If no sql_query executed -> NOT_EVALUATED.
 *   - Else -> uses an internal model call to create coverage SQL and run it,
 *            then returns TIMELINESS JSON.
 *
 * Continuity requirement:
 * - Not only MIN/MAX.
 * - Must detect missing years/months inside the covered interval when relevant.
 *
 * IMPORTANT (requested behavior):
 * - The DQ pass MAY run sql_query multiple times if it needs to iterate step-by-step.
 * - We still keep a hard cap to avoid runaway loops.
 */
async function dqPass(
    state: typeof MessagesAnnotation.State,
    config: RunnableConfig,
): Promise<typeof MessagesAnnotation.Update> {
    const configuration = ensureConfiguration(config);

    const datasetSchema = await getDatasetSchemaSummary();

    // Determine user question (last user message)
    let userQuestion = "";
    for (let i = state.messages.length - 1; i >= 0; i--) {
        const m: any = state.messages[i];
        if (m?.role === "user") {
            userQuestion = String(m.content ?? "");
            break;
        }
    }

    // Capture the final, user-visible assistant answer for DQ context (audit).
    const mainAssistantAnswer = getLastAssistantAnswer(state.messages) ?? "";

    // CHANGED (as requested):
    // Provide the FULL chat context (USER + ASSISTANT) to the DQ system, similar to the main assistant.
    // If the last user message is just a clarification (e.g., company name), DQ still sees the earlier timeframe.
    const allUserMessagesJoined = getAllUserMessagesJoined(state.messages);
    const chatTranscript = getChatTranscript(state.messages);
    const chatHistoryObjects = getChatHistoryObjects(state.messages);
    if (chatTranscript.length > 0) {
        userQuestion = chatTranscript;
    }

    // Collect executed SQL calls from the main assistant
    const sqls = getAllSqlCalls(state.messages);
    const mainSql = getLastSqlCall(state.messages);
    const usedTables = unionUsedTables(sqls);

    // Requirement: always write one stacked log row per user turn
    if (sqls.length === 0) {
        await writeThreadDqLog({
            langGraphThreadId: configuration.thread_id,
            indicatorsJson: {
                TIMELINESS: {
                    status: "NOT_EVALUATED",
                    text: "Timeliness was not assessed because no data query (sql_query) was performed.",
                },
            },
            usedTables: [],
            mainSql: null,
            dqSql: null,
        });

        return {};
    }

    // DQ model is restricted to the SQL tool(s) needed for coverage measurement.
    const model = (await loadChatModel(configuration.model)).bindTools([sqlQuery]);

    const dqInput = {
        user_question: userQuestion,
        main_assistant_answer: mainAssistantAnswer,
        all_sql_used: sqls,
        main_sql_used: mainSql,
        used_tables: usedTables,
        dataset_schema_summary: datasetSchema,

        // Additional context (kept small, but useful for debugging / robustness):
        // - all user messages only (if needed for simpler parsing)
        // - full chat history as structured objects (USER + ASSISTANT)
        // - system_time to resolve relative phrases deterministically
        user_messages_only: allUserMessagesJoined,
        chat_history: chatHistoryObjects,
        system_time: new Date().toISOString(),
    };

    // Scratch conversation ONLY for DQ pass (never appended to graph state)
    const scratch: any[] = [
        {role: "system", content: DQ_SYSTEM_PROMPT_TEMPLATE},
        {role: "user", content: JSON.stringify(dqInput, null, 2)},
    ];

    // CHANGED (as requested): allow multiple sql_query tool calls with a strict cap.
    // - The model can iterate step-by-step if it needs to (e.g., first coverage query yields no buckets).
    // - We still enforce: per step, exactly one sql_query tool call (no other tools).
    const MAX_DQ_SQL_CALLS = 5;

    let dqSqlUsed: string | null = null; // we persist the LAST dq sql (minimal DB change)
    let dqSqlCallCount = 0;
    let finalJsonText: string | null = null;

    // Tool loop (bounded)
    // - Each iteration: model either emits a sql_query OR emits final JSON.
    // - If it emits sql_query, we execute it and feed the result back.
    for (let step = 0; step < (MAX_DQ_SQL_CALLS + 2); step++) {
        const res = await model.invoke(scratch, {
            callbacks: [],          // kill token streaming to outer stream
        });

        const toolCalls = (res as any)?.tool_calls ?? [];
        if (toolCalls.length === 0) {
            finalJsonText = String((res as any)?.content ?? "").trim();
            break;
        }

        // Reject any non-sql_query tools and reject multiple tool calls in one step.
        const sqlCalls = toolCalls.filter((c: any) => c?.name === "sql_query");
        const nonSqlCalls = toolCalls.filter((c: any) => c?.name !== "sql_query");

        if (nonSqlCalls.length > 0 || sqlCalls.length !== 1) {
            finalJsonText = JSON.stringify(
                {
                    TIMELINESS: {
                        status: "UNKNOWN",
                        text: "DQ tool calls were invalid (must be exactly one sql_query per step)."
                    }
                },
                null,
                2,
            );
            break;
        }

        // Enforce the overall cap on sql_query calls.
        if (dqSqlCallCount >= MAX_DQ_SQL_CALLS) {
            finalJsonText = JSON.stringify(
                {TIMELINESS: {status: "UNKNOWN", text: "DQ exceeded the maximum allowed sql_query retries."}},
                null,
                2,
            );
            break;
        }

        const call = sqlCalls[0];
        if (!call?.args?.sql) {
            finalJsonText = JSON.stringify(
                {TIMELINESS: {status: "UNKNOWN", text: "DQ tool call was malformed."}},
                null,
                2,
            );
            break;
        }

        dqSqlUsed = String(call.args.sql);
        dqSqlCallCount++;

        /**
         * IMPORTANT (requested behavior):
         * - If sql_query fails (missing table/column etc.), we must NOT crash dqPass.
         * - Instead, we return the error as a ToolMessage so the DQ model can correct and retry
         *   in the next iteration(s), up to MAX_DQ_SQL_CALLS.
         */
        let toolOutput: unknown;
        try {
            toolOutput = await sqlQuery.invoke({sql: dqSqlUsed});
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toolOutput = `ERROR executing sql_query: ${msg}`;
        }

        scratch.push(res); // include AI tool request
        scratch.push(
            new ToolMessage({
                content: String(toolOutput),
                tool_call_id: call.id,
            }),
        );
    }

    let indicators: any;
    try {
        indicators = JSON.parse(finalJsonText ?? "");
    } catch {
        indicators = {
            TIMELINESS: {
                status: "UNKNOWN",
                text: "DQ output was not valid JSON.",
            },
        };
    }

    // Persist one row per user turn (append-only) linked by thread_id
    await writeThreadDqLog({
        langGraphThreadId: configuration.thread_id,
        indicatorsJson: indicators,
        usedTables,
        mainSql,
        dqSql: dqSqlUsed,
    });

    return {};
}

/** ---------- Build workflow ---------- */

/**
 * Workflow:
 * __start__ -> callModel -> (tools loop)* -> callModel -> dq_pass -> __end__
 *
 * - "tools" node executes tool calls emitted by callModel.
 * - When callModel returns without tool calls, we always run dq_pass next.
 */
const workflow = new StateGraph(MessagesAnnotation, ConfigurationSchema)
    .addNode("callModel", callModel)
    .addNode("tools", new ToolNode(TOOLS))
    .addNode("dq_pass", dqPass)
    .addEdge("__start__", "callModel")
    .addConditionalEdges("callModel", routeModelOutput)
    .addEdge("tools", "callModel")
    .addEdge("dq_pass", "__end__");

export const graph = workflow.compile({checkpointer});

/** ---------- CLI-safe async entrypoint ---------- */

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
