// app/api/study/chat/thread/dq/latest/route.ts

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireStudyParticipant} from "@/app/api/study/_auth";
import {jwtVerify} from "jose";
import {SESSION_COOKIE_NAME, getSecretKey} from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ManagementSessionPayload = { sub: string; type?: string };

// keep logs minimal (errors only in dev)
function logError(...args: any[]) {
    if (process.env.NODE_ENV !== "production") console.error("[dq/latest]", ...args);
}

async function requireManagementAdmin(req: NextRequest) {
    const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
    if (!cookie) return {ok: false as const, status: 401, error: "Missing management session."};

    try {
        const verified = await jwtVerify(cookie, getSecretKey());
        const payload = verified.payload as unknown as ManagementSessionPayload;

        if (!payload?.sub) return {ok: false as const, status: 401, error: "Invalid session payload."};
        if (payload.type && payload.type !== "session") return {
            ok: false as const,
            status: 401,
            error: "Invalid session type."
        };

        const user = await prisma.user.findUnique({
            where: {id: String(payload.sub)},
            select: {id: true, role: true, email: true},
        });

        if (!user) return {ok: false as const, status: 401, error: "User not found."};
        if (user.role !== "ADMIN") return {ok: false as const, status: 403, error: "Forbidden."};

        return {ok: true as const, user};
    } catch {
        return {ok: false as const, status: 401, error: "Invalid or expired session."};
    }
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const threadId = url.searchParams.get("threadId")?.trim();

        if (!threadId) {
            const res = NextResponse.json({ok: false, error: "Missing threadId"}, {status: 400});
            res.headers.set("Cache-Control", "no-store");
            return res;
        }

        const studySession = await requireStudyParticipant(req);
        const isStudyAuthed = studySession.ok && !!studySession.participant;
        const participant = isStudyAuthed ? studySession.participant : null;

        let isAdminAuthed = false;
        if (!isStudyAuthed) {
            const adminSession = await requireManagementAdmin(req);
            if (!adminSession.ok) {
                const res = NextResponse.json(
                    {ok: false, error: adminSession.error ?? "Unauthorized"},
                    {status: adminSession.status ?? 401},
                );
                res.headers.set("Cache-Control", "no-store");
                return res;
            }
            isAdminAuthed = true;
        }

        // Load latest DQ log for thread
        const latest = await prisma.threadDataQualityLog.findFirst({
            where: {langGraphThreadId: threadId},
            orderBy: {createdAt: "desc"},
            select: {
                id: true,
                createdAt: true,
                indicators: true,
                usedTables: true,
                mainSql: true,
                dqSql: true,
            },
        });

        if (!latest) {
            const res = NextResponse.json({ok: true, data: null});
            res.headers.set("Cache-Control", "no-store");
            return res;
        }

        // Ownership check for study participants only
        if (!isAdminAuthed && participant) {
            const thread = await prisma.chatThread.findUnique({
                where: {langGraphThreadId: threadId},
                select: {id: true, taskSession: {select: {participantId: true}}},
            });

            if (!thread) {
                const res = NextResponse.json({ok: false, error: "Thread not found in app DB."}, {status: 404});
                res.headers.set("Cache-Control", "no-store");
                return res;
            }

            if (thread.taskSession.participantId !== participant.id) {
                const res = NextResponse.json({ok: false, error: "Forbidden"}, {status: 403});
                res.headers.set("Cache-Control", "no-store");
                return res;
            }
        }

        const usedTables = latest.usedTables ?? [];

        const links = usedTables.length
            ? await prisma.datasetTable.findMany({
                where: {tableName: {in: usedTables}},
                select: {
                    tableName: true,
                    dataset: {
                        select: {
                            id: true,
                            key: true,
                            displayName: true,
                            origin: true,
                            author: true,
                            fileType: true,
                            fileSizeBytes: true,
                            recordCount: true,
                            createdAt: true,
                            updatedAt: true, // ✅ this is the dataset "LoadedAt" you want
                        },
                    },
                },
            })
            : [];

        const matchedTables = new Set<string>(links.map((l) => l.tableName));
        const unmatchedTables = usedTables.filter((t) => !matchedTables.has(t));

        const byDatasetId = new Map<
            string,
            { dataset: NonNullable<(typeof links)[number]["dataset"]>; tables: string[] }
        >();

        for (const l of links) {
            const ds = l.dataset;
            if (!ds) continue;
            const existing = byDatasetId.get(ds.id);
            if (existing) existing.tables.push(l.tableName);
            else byDatasetId.set(ds.id, {dataset: ds, tables: [l.tableName]});
        }

        const datasets = Array.from(byDatasetId.values()).map(({dataset, tables}) => ({
            key: dataset.key,
            displayName: dataset.displayName,
            origin: dataset.origin,
            author: dataset.author,
            fileType: dataset.fileType,
            fileSizeBytes: dataset.fileSizeBytes !== null ? String(dataset.fileSizeBytes) : null,
            recordCount: dataset.recordCount,
            createdAt: dataset.createdAt.toISOString(),
            updatedAt: dataset.updatedAt.toISOString(), // ✅
            tables,
        }));

        const res = NextResponse.json({
            ok: true,
            data: {
                ...latest,
                datasets,
                unmatchedTables,
            },
        });
        res.headers.set("Cache-Control", "no-store");
        return res;
    } catch (e) {
        logError("GET failed", e);
        const res = NextResponse.json({ok: false, error: "Internal server error"}, {status: 500});
        res.headers.set("Cache-Control", "no-store");
        return res;
    }
}
