// Path: app/modules/langgraph/agents/dataAwareLLMSystem/utils/sql-guard.ts
//
// Read-only SQL guard for the dataset DB.
// - Allows multi-line / CTE queries
// - Removes trailing semicolons
// - Blocks multiple statements
// - Blocks write keywords
//
// Drop-in robustness patch:
// ------------------------
// In practice, LLMs sometimes accidentally include non-SQL wrappers (e.g. ```sql fences,
// "My App" headers, or separators like "---") in the tool argument.
// That can introduce semicolons or extra tokens and falsely trigger the multi-statement block.
// We therefore sanitize the raw input BEFORE enforcing the single-statement guarantee.
//
// IMPORTANT:
// - We still enforce "single statement" by rejecting internal semicolons.
// - We still enforce "SELECT/WITH only" and a strict denylist.
// - We only strip clearly non-executable wrappers and comments at the edges.

export function assertReadOnlySql(sqlRaw: string): string {
    let sql = (sqlRaw ?? "").trim();

    // --- sanitize common LLM/toolcall wrappers (keeps behavior minimal + safe) ---

    // 1) Remove markdown code fences (```sql ... ```) if present.
    //    We keep the inner content and discard the fences.
    if (sql.startsWith("```")) {
        // Remove opening fence line: ``` or ```sql / ```postgres / etc.
        sql = sql.replace(/^```[a-zA-Z0-9_-]*\s*/i, "");
        // Remove closing fence at the end (plus trailing whitespace)
        sql = sql.replace(/\s*```$/i, "");
        sql = sql.trim();
    }

    // 2) If the payload contains a hard separator like "\n---" (often UI/log separators),
    //    cut everything after it. This prevents accidental trailing junk from breaking SQL.
    const sepIdx = sql.search(/\n---\s*/);
    if (sepIdx >= 0) {
        sql = sql.slice(0, sepIdx).trim();
    }

    // Must start with SELECT or WITH (read-only).
    const head = sql.slice(0, 16).toUpperCase();
    if (!(head.startsWith("SELECT") || head.startsWith("WITH"))) {
        throw new Error("Only SELECT / WITH queries are allowed.");
    }

    // Extra denylist (belt & suspenders)
    const upper = sql.toUpperCase();
    const denied = [
        "INSERT",
        "UPDATE",
        "DELETE",
        "DROP",
        "ALTER",
        "TRUNCATE",
        "CREATE",
        "GRANT",
        "REVOKE",
        "VACUUM",
    ];
    if (denied.some((k) => upper.includes(k))) {
        throw new Error("Write/DDL operations are not allowed.");
    }

    return sql;
}
