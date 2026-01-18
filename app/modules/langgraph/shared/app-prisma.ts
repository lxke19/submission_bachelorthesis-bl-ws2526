// Path: app/modules/langgraph/shared/app-prisma.ts
//
// Prisma Singleton for LangGraph runtime (Node process started by langgraphjs).
// We intentionally avoid "@/..." path aliases here to keep module resolution robust.
//
// Uses ONLY DATABASE_URL (App DB).
// This DB is NOT the LangGraph checkpoint DB.

import "dotenv/config";
import {PrismaClient} from "@/app/generated/prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
    throw new Error("[langgraph/shared/app-prisma] DATABASE_URL is not set (App DB).");
}

const adapter = new PrismaPg({connectionString});

// Avoid creating many clients in dev/hot reload scenarios
const globalForPrisma = globalThis as unknown as { __lgAppPrisma?: PrismaClient };

export const appPrisma =
    globalForPrisma.__lgAppPrisma ??
    new PrismaClient({
        adapter,
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__lgAppPrisma = appPrisma;
}
