/**
 * app/api/langgraph/_proxy.ts
 *
 * Robuster Reverse-Proxy:
 * Next.js (App Router)  ->  LangGraph Dev Server (langgraphjs dev)
 *
 * Warum du das brauchst:
 * - Deine UI läuft im Browser auf z.B. http://localhost:3000
 * - Deine Next-App/API läuft auf z.B. http://localhost:3001
 * - Dein LangGraph Dev Server läuft auf http://localhost:2024
 * - Browser erzwingt CORS, SSE/Streams müssen sauber durchgereicht werden
 *
 * Ziele:
 * ✅ CORS korrekt (inkl. Preflight OPTIONS)
 * ✅ Streaming (SSE) funktioniert (runs/stream)
 * ✅ Query-Strings bleiben erhalten
 * ✅ Header werden "vernünftig" weitergereicht
 * ✅ Hop-by-hop Header werden NICHT weitergereicht (wichtig für Streaming)
 * ✅ Content-Length wird entfernt (bei Streams sonst kaputt)
 *
 * ENV:
 * - LANGGRAPH_API_URL=http://localhost:2024
 * - CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
 */

const DEFAULT_UPSTREAM = "http://localhost:2024";

/**
 * Hop-by-hop Header (HTTP/1.1):
 * Diese dürfen niemals weitergereicht werden, sonst brichst du Chunking/SSE.
 */
const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

/**
 * Allowed Origins aus ENV (comma-separated).
 * Wenn nicht gesetzt, erlauben wir dev-typisch 3000 + 3001.
 */
function getAllowedOrigins(): string[] {
    const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
    if (!raw) return ["http://localhost:3000", "http://localhost:3001"];
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * CORS: wir "reflektieren" den Origin zurück (wenn er erlaubt ist).
 * Das ist wichtiger als "*", weil bei Credentials/SSE viele Browser streng sind.
 */
function resolveCorsOrigin(req: Request): string | null {
    const origin = req.headers.get("origin");
    if (!origin) return "*"; // server-to-server oder curl
    return getAllowedOrigins().includes(origin) ? origin : null;
}

/**
 * CORS Header für normale Responses.
 */
function buildCorsHeaders(req: Request): Headers {
    const h = new Headers();
    const origin = resolveCorsOrigin(req);

    if (origin) h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");

    // Falls du irgendwann Cookies/Auth aus dem Browser brauchst:
    h.set("Access-Control-Allow-Credentials", "true");

    // Damit der Browser ggf. Response-Header lesen darf:
    h.set("Access-Control-Expose-Headers", "*");

    return h;
}

/**
 * Preflight (OPTIONS) sauber beantworten.
 * Das ist essenziell, sonst bekommst du "CORS Missing Allow Origin".
 */
export function buildPreflightResponse(req: Request): Response {
    const h = buildCorsHeaders(req);

    // Methoden, die die UI nutzt:
    h.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

    // Browser fragt, welche Header er senden darf:
    const requested = req.headers.get("access-control-request-headers");
    h.set("Access-Control-Allow-Headers", requested ?? "*");

    // Optional: Preflight cachen (sek)
    h.set("Access-Control-Max-Age", "600");

    return new Response(null, {status: 204, headers: h});
}

/**
 * Build Header Richtung Upstream:
 * - Kopiere alles
 * - Entferne hop-by-hop
 * - Entferne Host (fetch setzt korrekt)
 * - Entferne accept-encoding (damit wir keine gzipped Bodies handeln müssen)
 */
function buildUpstreamHeaders(req: Request): Headers {
    const h = new Headers(req.headers);

    for (const key of Array.from(h.keys())) {
        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) h.delete(key);
    }

    h.delete("host");
    h.delete("accept-encoding");

    return h;
}

/**
 * Build Header Richtung Browser:
 * - Kopiere Upstream Header
 * - Entferne hop-by-hop
 * - Entferne content-length (bei Streams sonst häufig kaputt)
 * - Setze CORS Header drauf
 */
function buildDownstreamHeaders(req: Request, upstreamRes: Response): Headers {
    const h = new Headers(upstreamRes.headers);

    for (const key of Array.from(h.keys())) {
        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) h.delete(key);
    }

    // Streams + Next: content-length ist unzuverlässig
    h.delete("content-length");

    // CORS IMMER setzen (sonst blockt Browser)
    const cors = buildCorsHeaders(req);
    for (const [k, v] of cors.entries()) h.set(k, v);

    return h;
}

/**
 * Der Proxy selbst.
 *
 * @param req
 * @param pathRemainder z.B. "" oder "info" oder "threads/123/runs/stream"
 */
export async function proxyToLangGraph(
    req: Request,
    pathRemainder: string,
): Promise<Response> {
    const upstreamBase = (process.env.LANGGRAPH_API_URL?.trim() || DEFAULT_UPSTREAM).replace(
        /\/+$/,
        "",
    );

    const incomingUrl = new URL(req.url);
    const upstreamUrl = new URL(upstreamBase);

    // Pfad korrekt joinen (immer mit genau einem /)
    const cleanRemainder = pathRemainder.replace(/^\/+|\/+$/g, "");
    upstreamUrl.pathname = cleanRemainder ? `/${cleanRemainder}` : "/";

    // Query-String vollständig durchreichen
    upstreamUrl.search = incomingUrl.search;

    // Upstream fetch init
    const method = req.method.toUpperCase();
    const headers = buildUpstreamHeaders(req);

    // Debug-/Forwarding-Infos (optional, aber hilfreich):
    headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));
    headers.set("x-forwarded-host", incomingUrl.host);
    headers.set("x-forwarded-for", req.headers.get("x-forwarded-for") ?? "127.0.0.1");

    // WICHTIG für Node fetch streaming request body:
    // Next liefert req.body als Web-Stream => duplex:"half" ist notwendig.
    const init: RequestInit & { duplex?: "half" } = {
        method,
        headers,
        redirect: "manual",
        duplex: "half",
        body: ["GET", "HEAD"].includes(method) ? undefined : req.body,
    };

    let upstreamRes: Response;
    try {
        upstreamRes = await fetch(upstreamUrl.toString(), init);
    } catch (err: any) {
        // Upstream nicht erreichbar => Response mit CORS, sonst sieht Browser nix
        const cors = buildCorsHeaders(req);
        return new Response(
            `[proxyToLangGraph] Upstream unreachable: ${upstreamUrl}\n${String(err?.message ?? err)}`,
            {status: 502, headers: cors},
        );
    }

    const resHeaders = buildDownstreamHeaders(req, upstreamRes);

    // Body 1:1 durchreichen => SSE/Streaming bleibt intakt
    return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: resHeaders,
    });
}
