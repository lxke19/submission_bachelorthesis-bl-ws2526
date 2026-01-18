// app/(management)/management/(protected)/chat/page.tsx
//
// Purpose:
// - Management "Chat Playground" page.
// - Provides a dedicated area to test the assistant + LangGraph thread UI.
// - This is inside the protected management area (auth enforced by protected layout).
//
// Notes:
// - The actual UI is a client component because it uses providers/hooks that are client-side.
// - Query params (nuqs) can be used to set apiUrl / assistantId / threadId.

import ManagementChatPageClient from "./page-client";

export default function ManagementChatPage() {
    // Defaults from env:
    // - assistantId: public env (compile-time injected on client as well)
    // - apiUrl: internal env -> passed via server component as prop
    //
    // We still allow overriding via query params (apiUrl/assistantId/threadId).
    const defaultAssistantId = process.env.NEXT_PUBLIC_ASSISTANT_ID ?? "";
    const defaultApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

    return (
        <ManagementChatPageClient
            defaultAssistantId={defaultAssistantId}
            defaultApiUrl={defaultApiUrl}
        />
    );
}
