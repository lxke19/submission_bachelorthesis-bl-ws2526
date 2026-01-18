#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const START_POINT = path.join(ROOT, "app", "modules", "management", "dashboard");
const OUT_FILE = path.join(ROOT, "repo_overview.txt");

// Ordner, die komplett ignoriert werden sollen (egal wo)
const EXCLUDE_DIRS = new Set(["generated", "node_modules", ".next", ".turbo"]);

// Alle "dot folders" (Ordner, die mit "." starten) werden ignoriert,
// ABER: wir wollen trotzdem .env und .example.env Dateien erfassen.
function shouldSkipDir(dirName) {
    if (EXCLUDE_DIRS.has(dirName)) return true;
    if (dirName.startsWith(".")) return true; // alle Dot-Ordner skippen
    return false;
}

// Erlaubte Dateiendungen
const ALLOWED_EXT = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".json",
    ".css",
    ".md",
    ".yml",
    ".yaml",
    ".txt",
]);

// Diese Dotfiles sollen TROTZDEM erlaubt sein
const ALLOWED_DOTFILES = new Set([".env", ".example.env"]);

// Max. Lines pro Datei
const HEAD_LINES = 1000;

// Optional: Max Dateigröße (Bytes), um riesige Dateien nicht zu lesen
const MAX_BYTES = 1_000_000; // 1 MB

function isAllowedFile(filePath) {
    const base = path.basename(filePath);

    if (ALLOWED_DOTFILES.has(base)) return true;

    const ext = path.extname(base).toLowerCase();
    return ALLOWED_EXT.has(ext);
}

function readFirstLines(filePath, n) {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_BYTES) {
            return [`[SKIPPED CONTENT: file too large (${stat.size} bytes)]`];
        }

        // Datei als Text lesen (utf8). Wenn Binary/Encoding kaputt ist -> catch
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split(/\r?\n/);
        return lines.slice(0, n);
    } catch (err) {
        return [`[ERROR reading file: ${String(err?.message ?? err)}]`];
    }
}

function walk(dirAbsPath, results) {
    let entries;
    try {
        entries = fs.readdirSync(dirAbsPath, {withFileTypes: true});
    } catch (err) {
        // z.B. Permission denied
        results.push({
            type: "error",
            path: dirAbsPath,
            error: String(err?.message ?? err),
        });
        return;
    }

    // Sortierung: Ordner zuerst, dann Dateien, alphabetisch
    entries.sort((a, b) => {
        const aIsDir = a.isDirectory();
        const bIsDir = b.isDirectory();
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
        const abs = path.join(dirAbsPath, entry.name);

        if (entry.isDirectory()) {
            if (shouldSkipDir(entry.name)) continue;
            walk(abs, results);
            continue;
        }

        if (!entry.isFile()) continue;

        // Wenn Datei ein Dotfile ist, erlauben wir nur explizite (.env, .example.env)
        if (entry.name.startsWith(".") && !ALLOWED_DOTFILES.has(entry.name)) {
            continue;
        }

        if (!isAllowedFile(abs)) continue;

        let size = 0;
        try {
            size = fs.statSync(abs).size;
        } catch {
            size = 0;
        }

        const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
        const head = readFirstLines(abs, HEAD_LINES);

        results.push({
            type: "file",
            relPath: rel,
            size,
            head,
        });
    }
}

function writeOutput(results) {
    const lines = [];
    lines.push(`Repo overview generated: ${new Date().toISOString()}`);
    lines.push(`Root: ${ROOT.replace(/\\/g, "/")}`);
    lines.push(
        `Excluded dirs: ${Array.from(EXCLUDE_DIRS).join(", ")} + all dot-folders`,
    );
    lines.push(`Included dotfiles: ${Array.from(ALLOWED_DOTFILES).join(", ")}`);
    lines.push(`Allowed extensions: ${Array.from(ALLOWED_EXT).join(", ")}`);
    lines.push(`Head lines per file: ${HEAD_LINES}`);
    lines.push(`Max bytes per file to preview: ${MAX_BYTES}`);
    lines.push("");

    for (const item of results) {
        if (item.type === "error") {
            lines.push(`!! ERROR: ${item.path}`);
            lines.push(`   ${item.error}`);
            lines.push("");
            continue;
        }

        lines.push(`=== ${item.relPath} (${item.size} bytes) ===`);
        for (let i = 0; i < item.head.length; i++) {
            // Zeilen nummerieren
            lines.push(`${String(i + 1).padStart(2, "0")}: ${item.head[i]}`);
        }
        lines.push("");
    }

    fs.writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
}

function main() {
    const results = [];
    walk(START_POINT, results);
    writeOutput(results);

    console.log(`Done. Wrote: ${path.relative(ROOT, OUT_FILE)}`);
    console.log(`Files listed: ${results.filter((x) => x.type === "file").length}`);
}

main();
