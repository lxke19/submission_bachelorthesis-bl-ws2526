// Path: app/modules/langgraph/agents/dataAwareLLMSystem/persist/write-thread-dq-log.ts
//
// Persist data-quality indicator + used tables to App DB (Prisma).
// Linked only by langGraphThreadId (your requirement).


import {appPrisma} from "@/app/modules/langgraph/shared/app-prisma";

export async function writeThreadDqLog(args: {
    langGraphThreadId: string;
    indicatorsJson: any; // must be JSON-serializable
    usedTables: string[];
    mainSql: string | null;
    dqSql: string | null;
}) {
    await appPrisma.threadDataQualityLog.create({
        data: {
            langGraphThreadId: args.langGraphThreadId,
            indicators: args.indicatorsJson,
            usedTables: args.usedTables,
            mainSql: args.mainSql,
            dqSql: args.dqSql,
        },
    });
}
