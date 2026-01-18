/**
 * Path: app/modules/langgraph/agents/dataAwareLLMSystem/setup-postgres.ts
 *
 * Same rationale as tavilyAgent/setup-postgres.ts:
 * The LangGraph CLI dev server imports exported `graph` directly,
 * so lazy setup may not run. Run this script once to create checkpoint tables.
 */

import "dotenv/config";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";

function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`[dataAwareLLMSystem/setup-postgres] Missing env var "${name}"`);
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
            `[dataAwareLLMSystem/setup-postgres] Unsafe Postgres schema name "${schema}". Allowed: letters, digits, underscore.`,
        );
    }
    return s;
}

async function main() {
    const postgresUrl = requireEnv("LANGGRAPH_POSTGRES_URL");

    const postgresSchema = assertSafeSchemaName(
        envOrDefault(
            "LANGGRAPH_POSTGRES_SCHEMA_DATA_AWARE",
            envOrDefault("LANGGRAPH_POSTGRES_SCHEMA", "lg_data_aware_llm_system"),
        ),
    );

    console.log("[dataAwareLLMSystem/setup-postgres] Using:", postgresUrl.slice(0, 48) + "…");
    console.log("[dataAwareLLMSystem/setup-postgres] Schema:", postgresSchema);

    const checkpointer = PostgresSaver.fromConnString(postgresUrl, {schema: postgresSchema});

    console.log("[dataAwareLLMSystem/setup-postgres] Running checkpointer.setup() …");
    await checkpointer.setup();
    console.log("[dataAwareLLMSystem/setup-postgres] ✅ Done. Tables exist now.");
}

main().catch((err) => {
    console.error("\n[dataAwareLLMSystem/setup-postgres:FATAL]", err);
    process.exitCode = 1;
});
