"use client";

// app/modules/management/components/ManagementNav.tsx
//
// Navigation im geschützten Management-Bereich.
// - Links zu Management-Seiten
// - Logout Button
//
// Später kannst du hier Rollen/Rechte und dynamische Menüs ergänzen.

import Link from "next/link";
import {usePathname, useRouter} from "next/navigation";
import {logout} from "@/app/modules/auth/api";

function cx(...parts: Array<string | false | undefined | null>) {
    return parts.filter(Boolean).join(" ");
}

export function ManagementNav() {
    const pathname = usePathname();
    const router = useRouter();

    async function handleLogout() {
        await logout();
        router.push("/management");
        router.refresh();
    }

    const itemClass = (href: string) =>
        cx(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            "hover:bg-rose-900/25 hover:text-rose-100",
            pathname === href ? "bg-rose-900/35 text-rose-100" : "text-slate-200",
        );

    return (
        <nav className="flex flex-wrap items-center gap-2">
            <Link className={itemClass("/")} href="/">
                Startseite
            </Link>

            <Link className={itemClass("/management/dashboard")} href="/management/dashboard">
                Dashboard
            </Link>

            <Link className={itemClass("/management/surveys")} href="/management/surveys">
                Surveys
            </Link>

            <Link className={itemClass("/management/participants")} href="/management/participants">
                Participants
            </Link>

            <Link className={itemClass("/management/chat")} href="/management/chat">
                Chat (Test)
            </Link>

            {/* Platz für spätere Seiten: Agent Chat UI, Users, Settings, etc. */}
            {/* <Link className={itemClass("/management/agent-chat")} href="/management/agent-chat">Agent Chat</Link> */}

            <button
                type="button"
                onClick={handleLogout}
                className="ml-2 rounded-lg border border-rose-900/40 bg-black/20 px-3 py-2 text-sm font-semibold text-slate-50 hover:bg-rose-900/25"
            >
                Logout
            </button>
        </nav>
    );
}
