// Path: app/modules/langgraph/agents/dataAwareLLMSystem/utils/extract-used-tables.ts
//
// Best-effort table extraction from SQL.
// Goal: store "used tables" for CSV mapping + transparency.
// This is intentionally heuristic (SQL parsing is hard); but good enough for FROM/JOIN patterns.

function normalizeIdent(s: string) {
    return s.replace(/["`]/g, "").trim();
}

export function extractUsedTables(sql: string): string[] {
    const text = (sql ?? "").replace(/\s+/g, " ").trim();

    // Match FROM <schema.table> or JOIN <schema.table>
    // Also accept quoted identifiers.
    const regex =
        /\b(?:FROM|JOIN)\s+((?:"[^"]+"|[A-Za-z0-9_]+)\.(?:"[^"]+"|[A-Za-z0-9_]+))/gi;

    const out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text))) {
        const raw = m[1] ?? "";
        const cleaned = normalizeIdent(raw);
        if (cleaned.includes(".")) out.add(cleaned);
    }

    return [...out].sort();
}
