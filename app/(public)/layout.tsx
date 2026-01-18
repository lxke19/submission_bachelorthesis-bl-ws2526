// app/(public)/layout.tsx
import Link from "next/link";
import type {ReactNode} from "react";

export default function PublicLayout({children}: { children: ReactNode }) {
    return (
        <div className="h-full min-h-0 flex flex-col">
            <header className="shrink-0 border-b border-rose-900/30 bg-black/30 px-4 py-3">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
                    <Link href="/" className="text-base font-semibold tracking-tight text-slate-50">
                        My App
                    </Link>

                    <nav className="flex items-center gap-2">
                        <Link
                            href="/management"
                            className="rounded-lg border border-rose-900/40 bg-black/20 px-3 py-2 text-sm font-semibold text-slate-50 hover:bg-rose-900/25"
                        >
                            Zur Verwaltung
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Wichtig: flex-1 + min-h-0 => Child kann h-full korrekt nutzen */}
            <main className="mx-auto w-full max-w-5xl flex-1 min-h-0 px-4">
                {children}
            </main>
        </div>
    );
}
