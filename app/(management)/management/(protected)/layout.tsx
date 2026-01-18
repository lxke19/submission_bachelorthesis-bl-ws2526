// app/(management)/management/(protected)/layout.tsx
//
// Geschützter Bereich innerhalb /management/*
// - Auth-Check auf Server-Seite
// - Kein Login? → redirect("/management")
// - Nutzt eine Navbar (ManagementNav)

import type {ReactNode} from "react";
import {redirect} from "next/navigation";
import {requireAuthenticatedUser} from "@/app/lib/auth";
import {ManagementNav} from "@/app/modules/management/components/ManagementNav";

export default async function ManagementProtectedLayout({
                                                            children,
                                                        }: {
    children: ReactNode;
}) {
    const user = await requireAuthenticatedUser();
    if (!user) {
        redirect("/management");
    }

    return (
        <div className="min-h-screen bg-neutral-900 text-neutral-200 flex flex-col">
            <header className="border-b border-rose-900/30 px-4 py-3 bg-black/30">
                <div className="mx-auto max-w-5xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-base font-semibold">Verwaltung</span>
                        <span className="hidden sm:inline text-xs text-slate-400">
              Eingeloggt als {user.email}
            </span>
                    </div>

                    <ManagementNav/>
                </div>
            </header>

            <main className="mx-auto max-w-5xl w-full px-4 py-6 flex-1 text-[15px]">
                {children}
            </main>
        </div>
    );
}
