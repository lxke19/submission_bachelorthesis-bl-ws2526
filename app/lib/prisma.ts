// app/lib/prisma.ts
//
// Prisma Client Singleton (Next.js Dev-Mode friendly).
// Prisma 7: Adapter-Setup mit @prisma/adapter-pg.
// Nutzt ausschließlich DATABASE_URL (App DB).
//
// Wichtig: Diese DB hat NICHTS mit LangGraph Checkpointing zu tun.

import {PrismaClient} from "@/app/generated/prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL ist nicht gesetzt (App DB).");
}

const adapter = new PrismaPg({connectionString});

// In Next.js dev wird der Code oft neu geladen - wir vermeiden neue DB Connections:
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
