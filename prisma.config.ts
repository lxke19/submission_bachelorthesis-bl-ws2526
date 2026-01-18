// prisma/prisma.config.ts
//
// Prisma 7+ Konfiguration (neuer Config-Ansatz).
// Wichtig: Diese Datei ersetzt NICHT das schema.prisma, sondern ergänzt Prisma CLI Einstellungen.

import "dotenv/config";
import {defineConfig, env} from "prisma/config";

export default defineConfig({
    // Pfad zum Prisma Schema
    schema: "prisma/schema.prisma",

    // Wo Migrationen liegen
    migrations: {
        path: "prisma/migrations",
    },

    // Datasource URL aus ENV
    // Für deine Web-App: DATABASE_URL (separate DB von LangGraph!)
    datasource: {
        url: env("DATABASE_URL"),
    },
});
