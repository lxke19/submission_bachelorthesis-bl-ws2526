/**
 * Path: app/modules/langgraph/agents/tavilyAgent/setup-postgres.ts
 *
 * WHAT THIS SCRIPT DOES:
 * ----------------------
 * It creates the required Postgres tables for LangGraph checkpointing.
 *
 * WHY THIS EXISTS:
 * ----------------
 * - The LangGraph CLI dev server usually imports an exported `graph` directly.
 * - It does NOT call your `getGraph()` factory.
 * - Therefore your "lazy setup" might never run before the first request.
 *
 * SOLUTION:
 * ---------
 * Run this script once before starting the dev server.
 */

import "dotenv/config";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";

function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) {
        throw new Error(`[setup-postgres] Missing env var "${name}"`);
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
            `[setup-postgres] Unsafe Postgres schema name "${schema}". ` +
            `Allowed: letters, digits, underscore.`,
        );
    }
    return s;
}

async function main() {
    const postgresUrl = requireEnv("LANGGRAPH_POSTGRES_URL");

    const postgresSchema = assertSafeSchemaName(
        envOrDefault(
            "LANGGRAPH_POSTGRES_SCHEMA_TAVILY",
            envOrDefault("LANGGRAPH_POSTGRES_SCHEMA", "lg_tavily_agent"),
        ),
    );

    console.log("[setup-postgres] Using:", postgresUrl.slice(0, 48) + "…");
    console.log("[setup-postgres] Schema:", postgresSchema);

    // NOTE:
    // We intentionally do NOT import/use "pg" here.
    // PostgresSaver.setup() creates the required tables.
    // If the schema does not exist and your DB user cannot create schemas,
    // create it once manually, e.g.:
    //   CREATE SCHEMA IF NOT EXISTS lg_tavily_agent;
    const checkpointer = PostgresSaver.fromConnString(postgresUrl, {schema: postgresSchema});

    console.log("[setup-postgres] Running checkpointer.setup() …");
    await checkpointer.setup();
    console.log("[setup-postgres] ✅ Done. Tables exist now.");
}

main().catch((err) => {
    console.error("\n[setup-postgres:FATAL]", err);
    process.exitCode = 1;
});
