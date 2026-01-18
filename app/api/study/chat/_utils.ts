// app/api/study/chat/_utils.ts
//
// Purpose:
// - Shared helpers for chat persistence endpoints (/api/study/chat/*).
// - Keep routes small and consistent.
// - Avoid importing client UI utils into server routes.
//
// Notes:
// - ChatMessage.content is a String, but LangGraph messages can be multimodal.
// - We store a "best-effort" visible string in content and keep raw payload in metadata.rawContent.
// - De-duplication is based on metadata.langGraphMessageId (since schema has no explicit column).

import {z} from "zod";
import {ChatRole} from "@/app/generated/prisma/enums";
import {Prisma} from "@/app/generated/prisma/client";

export const ZLangGraphMessageType = z.enum(["human", "ai", "tool"]);

export function mapLangGraphTypeToRole(type: z.infer<typeof ZLangGraphMessageType>): ChatRole {
    switch (type) {
        case "human":
            return "USER";
        case "ai":
            return "ASSISTANT";
        case "tool":
            return "TOOL";
        default:
            // Exhaustive check; should never happen due to Zod enum.
            return "SYSTEM";
    }
}

/**
 * Best-effort stringify for LangGraph Message.content.
 * - string: return as-is
 * - array: join all text blocks ("type":"text") with space
 * - other: JSON.stringify
 */
export function contentToVisibleString(content: unknown): string {
    if (typeof content === "string") return content;

    if (Array.isArray(content)) {
        const texts = content
            .filter((c) => typeof c === "object" && c !== null && (c as any).type === "text")
            .map((c) => String((c as any).text ?? ""))
            .filter((s) => s.trim().length > 0);

        if (texts.length > 0) return texts.join(" ");
        // No text blocks → store a generic label (still append-only, raw content is preserved in metadata)
        return "Multimodal message";
    }

    try {
        return JSON.stringify(content);
    } catch {
        return String(content);
    }
}

/**
 * Convert an unknown value into a Prisma JSON-safe value.
 *
 * Why:
 * - Prisma Json fields require Prisma.InputJsonValue.
 * - LangGraph message content is typed as unknown and may contain non-JSON values.
 *
 * Strategy:
 * - Try a JSON roundtrip (drops functions/undefined/symbols, converts Dates to ISO strings, etc.)
 * - If that fails (circular refs), fall back to a string.
 */
export function unknownToJsonValue(value: unknown): Prisma.InputJsonValue | null {
    if (value === undefined) return null;

    try {
        // JSON roundtrip makes it safe for Prisma Json.
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
        // Fallback: store a readable scalar.
        if (value === null) return null;
        if (typeof value === "string") return value;
        if (typeof value === "number") return value;
        if (typeof value === "boolean") return value;
        return String(value) as unknown as Prisma.InputJsonValue;
    }
}
