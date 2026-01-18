/**
 * Path: app/modules/langgraph/agents/dataAwareLLMSystem/sync-dataset-catalog.ts
 *
 * Dataset Catalog Sync (App DB)
 * =============================
 *
 * Purpose
 * -------
 * - On startup, automatically populate the App DB tables:
 *   - Dataset (CSV metadata for Data Insights UI)
 *   - DatasetTable (mapping from SQL tables used by the agent -> dataset CSV sources)
 *
 * Why
 * ---
 * - Your DQ endpoint (`/api/study/chat/thread/dq/latest`) resolves `usedTables` by joining:
 *   usedTables[] -> DatasetTable.tableName -> Dataset.*
 * - If Dataset/DatasetTable are empty, the UI shows unmatched tables and "Loaded at: -".
 *
 * Source of truth
 * ---------------
 * - `/data/dataset-manifest.json` (repo path `data/dataset-manifest.json`)
 * - This keeps the mapping deterministic and versionable alongside the datasets.
 *
 * Data dir resolution
 * -------------------
 * - Prefer `/data` (docker volume).
 * - Fallback to `<repoRoot>/data` for local dev.
 *
 * Record count policy
 * -------------------
 * - Counting CSV lines can be expensive for huge files.
 * - By default, we DO count lines (streaming, not loading into RAM).
 * - Disable with: DATASET_SYNC_COUNT_RECORDS=false
 *
 * IMPORTANT (env loading)
 * -----------------------
 * - `tsx` does NOT automatically load `.env` like Next.js does.
 * - We must load dotenv before importing Prisma, otherwise `DATABASE_URL` is undefined
 *   and `app/lib/prisma.ts` will throw.
 */

// ✅ Load .env for CLI/script execution BEFORE Prisma import
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {prisma} from "@/app/lib/prisma";

type ManifestEntry = {
    key: string;
    path: string; // relative to /data (or repo data/)
    displayName?: string | null;
    origin?: string | null;
    author?: string | null;
    fileType?: string | null;
    hasHeader?: boolean | null;
    tables?: string[] | null;
};

function dbg(...args: any[]) {
    if (process.env.NODE_ENV !== "production") {
        // keep logs readable, but available in dev
        console.log("[dataset:catalog:sync]", ...args);
    }
}

function warn(...args: any[]) {
    console.warn("[dataset:catalog:sync]", ...args);
}

function resolveDataDir(): string | null {
    const dockerPath = "/data";
    if (fs.existsSync(dockerPath) && fs.statSync(dockerPath).isDirectory()) return dockerPath;

    const localPath = path.join(process.cwd(), "data");
    if (fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()) return localPath;

    return null;
}

async function countCsvRecords(fileAbsPath: string, hasHeader: boolean): Promise<number | null> {
    const enabled = String(process.env.DATASET_SYNC_COUNT_RECORDS ?? "true").toLowerCase() !== "false";
    if (!enabled) return null;

    // Streaming line count (RAM safe).
    // For very large files, this is IO-heavy but deterministic and simple.
    return new Promise<number>((resolve, reject) => {
        let lines = 0;

        const stream = fs.createReadStream(fileAbsPath);
        stream.on("error", reject);

        const rl = readline.createInterface({input: stream, crlfDelay: Infinity});

        rl.on("line", () => {
            lines += 1;
        });

        rl.on("close", () => {
            // CSV with header: records = lines - 1 (clamped at >=0)
            const records = Math.max(0, hasHeader ? lines - 1 : lines);
            resolve(records);
        });
    }).catch((e) => {
        warn("Failed to count records for", fileAbsPath, e);
        return null;
    });
}

function normalizeTableName(t: string): string {
    // Keep it conservative: lowercasing + trimming + remove surrounding quotes
    // (your current usedTables examples are already in the correct format).
    const s = String(t ?? "").trim();
    return s.replace(/^"+|"+$/g, "").toLowerCase();
}

async function syncOne(entry: ManifestEntry, dataDir: string) {
    const rel = entry.path ?? "";
    const fileAbsPath = path.join(dataDir, rel);

    if (!fs.existsSync(fileAbsPath) || !fs.statSync(fileAbsPath).isFile()) {
        warn(`File not found, skipping: ${fileAbsPath} (from manifest path: ${rel})`);
        return {ok: false as const, key: entry.key, reason: "file_not_found" as const};
    }

    const stat = fs.statSync(fileAbsPath);
    const fileSizeBytes = stat.size;

    const ext = (entry.fileType ?? path.extname(fileAbsPath).replace(".", "") ?? "csv") || "csv";
    const hasHeader = entry.hasHeader !== false; // default true
    const recordCount = await countCsvRecords(fileAbsPath, hasHeader);

    const key = entry.key;
    const displayName = entry.displayName ?? null;
    const origin = entry.origin ?? null;
    const author = entry.author ?? null;
    const fileType = ext ?? null;

    const desiredTables = (entry.tables ?? [])
        .filter(Boolean)
        .map((t) => normalizeTableName(String(t)))
        .filter((t) => t.length > 0);

    // Upsert dataset metadata
    const ds = await prisma.dataset.upsert({
        where: {key},
        create: {
            key,
            displayName,
            origin,
            author,
            fileType,
            fileSizeBytes: BigInt(fileSizeBytes),
            recordCount: typeof recordCount === "number" ? recordCount : null,
        },
        update: {
            displayName,
            origin,
            author,
            fileType,
            fileSizeBytes: BigInt(fileSizeBytes),
            recordCount: typeof recordCount === "number" ? recordCount : null,
            // NOTE: Prisma will bump updatedAt on update.
            // This makes your UI "Loaded at" reflect the last startup sync.
        },
        select: {id: true, key: true},
    });

    // Sync mapping rows:
    // - Add missing
    // - Remove stale (so manifest is source-of-truth)
    await prisma.datasetTable.deleteMany({
        where: {
            datasetId: ds.id,
            tableName: desiredTables.length ? {notIn: desiredTables} : undefined,
        },
    });

    if (desiredTables.length) {
        await prisma.datasetTable.createMany({
            data: desiredTables.map((tableName) => ({
                datasetId: ds.id,
                tableName,
            })),
            skipDuplicates: true,
        });
    }

    return {ok: true as const, key, datasetId: ds.id, tables: desiredTables};
}

async function main() {
    const dataDir = resolveDataDir();
    if (!dataDir) {
        warn("No /data or ./data directory found. Nothing to sync.");
        process.exit(0);
    }

    const manifestPath = path.join(dataDir, "dataset-manifest.json");
    if (!fs.existsSync(manifestPath)) {
        warn(`Manifest missing: ${manifestPath}. Create data/dataset-manifest.json to enable catalog sync.`);
        process.exit(0);
    }

    let manifest: ManifestEntry[] = [];
    try {
        const raw: string = fs.readFileSync(manifestPath, "utf8");
        const parsed: any = JSON.parse(raw);

        // ✅ No local throw. Handle shape error explicitly (removes IDE warning and is clearer).
        if (!Array.isArray(parsed)) {
            warn("Manifest must be a JSON array.", manifestPath);
            process.exit(1);
        }

        manifest = parsed as ManifestEntry[];
    } catch (e) {
        warn("Failed to parse manifest JSON:", manifestPath, e);
        process.exit(1);
    }

    dbg("Using dataDir:", dataDir);
    dbg("Using manifest:", manifestPath);
    dbg("Entries:", manifest.length);

    const results: any[] = [];
    for (const entry of manifest) {
        if (!entry?.key || !entry?.path) {
            warn("Skipping invalid manifest entry (missing key/path):", entry);
            continue;
        }
        const r = await syncOne(entry, dataDir);
        results.push(r);
    }

    const ok = results.filter((r) => r.ok).length;
    const bad = results.length - ok;

    dbg(`Done. ok=${ok} failed=${bad}`);

    // Ensure prisma disconnect in scripts context
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error("[dataset:catalog:sync] fatal:", e);
    try {
        await prisma.$disconnect();
    } catch {
        // no-op
    }
    process.exit(1);
});
