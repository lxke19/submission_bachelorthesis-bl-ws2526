// Path: app/modules/langgraph/agents/dataAwareLLMSystem/utils/get-dataset-schema-summary.ts
//
// Introspect dataset DB schema once per process (cached).
// We keep it compact because it goes into the system prompt.

import "dotenv/config";
import {Pool} from "pg";

function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) {
        throw new Error(`[dataAwareLLMSystem/schema] Missing env var "${name}".`);
    }
    return v;
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

let cachedSummary: string | null = null;

export async function getDatasetSchemaSummary(): Promise<string> {
    if (cachedSummary) return cachedSummary;

    const client = await getPool().connect();
    try {
        const res = await client.query<{
            table_schema: string;
            table_name: string;
            column_name: string;
            data_type: string;
            ordinal_position: number;
        }>(`
            SELECT table_schema, table_name, column_name, data_type, ordinal_position
            FROM information_schema.columns
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name, ordinal_position
        `);

        // Group into a compact summary: schema.table(col:type, col:type, ...)
        const lines: string[] = [];
        let currentKey = "";
        let cols: string[] = [];

        const flush = () => {
            if (!currentKey) return;
            // cap columns per table to keep prompt small
            const colText = cols.slice(0, 40).join(", ");
            lines.push(`- ${currentKey} (${colText}${cols.length > 40 ? ", …" : ""})`);
        };

        for (const r of res.rows) {
            const key = `${r.table_schema}.${r.table_name}`;
            if (key !== currentKey) {
                flush();
                currentKey = key;
                cols = [];
            }
            cols.push(`${r.column_name}:${r.data_type}`);
        }
        flush();

        // cap total size as well
        const header = "Dataset DB schema (introspected):";
        const body = lines.slice(0, 80).join("\n");
        cachedSummary =
            header + "\n" + body + (lines.length > 80 ? "\n… (truncated)" : "");

        return cachedSummary;
    } finally {
        client.release();
    }
}
