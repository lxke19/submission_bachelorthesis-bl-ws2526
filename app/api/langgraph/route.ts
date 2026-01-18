/**
 * app/api/langgraph/route.ts
 *
 * Root-Proxy für:
 *   /api/langgraph
 *
 * Wichtig:
 * - Next braucht `runtime/dynamic` als "echte" Exports in DER Datei.
 *   NICHT re-exporten, sonst kommt:
 *   "Next.js can't recognize exported runtime/dynamic... mustn't be reexported."
 *
 * - Wir unterstützen auch OPTIONS (CORS Preflight).
 * - Root ist nicht immer genutzt (UIs callen oft /info),
 *   aber root sollte trotzdem funktionieren.
 */

import {buildPreflightResponse, proxyToLangGraph} from "./_proxy";

// Für Streaming/SSE zwingend Node runtime:
export const runtime = "nodejs";

// Kein Caching, keine Static Optimizations:
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function OPTIONS(req: Request) {
    return buildPreflightResponse(req);
}

export async function GET(req: Request) {
    return proxyToLangGraph(req, "");
}

export async function POST(req: Request) {
    return proxyToLangGraph(req, "");
}

export async function PUT(req: Request) {
    return proxyToLangGraph(req, "");
}

export async function PATCH(req: Request) {
    return proxyToLangGraph(req, "");
}

export async function DELETE(req: Request) {
    return proxyToLangGraph(req, "");
}
