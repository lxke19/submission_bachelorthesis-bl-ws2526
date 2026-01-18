// Path: app/modules/langgraph/agents/dataAwareLLMSystem/tools/sql-query.ts
//
// SQL Tool (Dataset DB):
// - read-only enforced
// - supports multi-line SQL, CTEs, complex computations
// - statement_timeout to avoid hanging
// - returns compact JSON for the model

import "dotenv/config";
import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {Pool} from "pg";
import {assertReadOnlySql} from "../utils/sql-guard.js";

function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`[dataAwareLLMSystem/sql_query] Missing env var "${name}".`);
    return v;
}

function envInt(name: string, fallback: number): number {
    const raw = process.env[name]?.trim();
    const n = raw ? Number(raw) : fallback;
    return Number.isFinite(n) ? n : fallback;
}

let pool: Pool | null = null;

function getPool(): Pool {
    if (!pool) {
        pool = new Pool({
            connectionString: requireEnv("DATASET_POSTGRES_URL"),
            max: 5,
        });
    }
    return pool;
}

export const sqlQuery = tool(
    async ({sql}) => {
        const maxRows = envInt("DATASET_SQL_MAX_ROWS", 500);
        const timeoutMs = envInt("DATASET_SQL_STATEMENT_TIMEOUT_MS", 8000);

        const safe = assertReadOnlySql(sql);

        const client = await getPool().connect();
        try {
            await client.query(`SET statement_timeout = ${timeoutMs}`);
            const res = await client.query(safe);

            return JSON.stringify(
                {
                    ok: true,
                    rowCount: res.rowCount ?? res.rows.length,
                    rows: res.rows.slice(0, maxRows),
                    meta: {
                        truncated: (res.rows.length ?? 0) > maxRows,
                        maxRows,
                        timeoutMs,
                    },
                },
                null,
                2,
            );
        } finally {
            client.release();
        }
    },
    {
        name: "sql_query",
        description:
            "Run a READ-ONLY SQL query against the dataset database. Allowed: SELECT/CTE queries only.",
        schema: z.object({
            sql: z.string().min(1).describe("A single SELECT/CTE SQL statement (multi-line allowed)."),
        }),
    },
);
