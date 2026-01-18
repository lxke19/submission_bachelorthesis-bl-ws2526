/**
 * app/api/langgraph/[...path]/route.ts
 *
 * Catch-all Proxy für alles unter:
 *   /api/langgraph/*
 *
 * Beispiele:
 * - /api/langgraph/info
 * - /api/langgraph/threads
 * - /api/langgraph/threads/:id/runs/stream   (SSE Streaming)
 *
 * Next.js 16 Änderung:
 * - ctx.params ist ein Promise
 * - du MUSST `await ctx.params` bevor du es benutzt
 *   sonst kommt:
 *   "params is a Promise and must be unwrapped..."
 */

import {buildPreflightResponse, proxyToLangGraph} from "../_proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { path?: string[] };

/**
 * Pfad-Segmente zu "threads/123/runs/stream" joinen.
 * - trimmt slashes
 * - entfernt leere Segmente
 */
function joinPath(params: Params): string {
    const parts = params.path ?? [];
    return parts
        .map((p) => p.replace(/^\/+|\/+$/g, ""))
        .filter(Boolean)
        .join("/");
}

/**
 * CORS Preflight.
 * Der Browser schickt OPTIONS bevor er echte Requests sendet,
 * insbesondere bei Authorization Headern oder non-simple content-types.
 */
export async function OPTIONS(req: Request) {
    return buildPreflightResponse(req);
}

/**
 * Next.js 16: ctx.params ist Promise<Params>
 * -> await!
 */
async function getRemainder(ctx: { params: Promise<Params> }) {
    const params = await ctx.params;
    return joinPath(params);
}

export async function GET(req: Request, ctx: { params: Promise<Params> }) {
    return proxyToLangGraph(req, await getRemainder(ctx));
}

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
    return proxyToLangGraph(req, await getRemainder(ctx));
}

export async function PUT(req: Request, ctx: { params: Promise<Params> }) {
    return proxyToLangGraph(req, await getRemainder(ctx));
}

export async function PATCH(req: Request, ctx: { params: Promise<Params> }) {
    return proxyToLangGraph(req, await getRemainder(ctx));
}

export async function DELETE(req: Request, ctx: { params: Promise<Params> }) {
    return proxyToLangGraph(req, await getRemainder(ctx));
}
