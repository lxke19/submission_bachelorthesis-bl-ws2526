// app/layout.tsx
//
// Global Root Layout
// - Globaler NuqsAdapter: notwendig für useQueryState() in Agent-Chat-UI (Thread, Provider)
// - Globaler ThemeProvider (next-themes): notwendig, weil Toaster useTheme() nutzt
// - Globaler Toaster: einmal zentral (toast(...) überall möglich)
// - Globaler neutraler grauer Hintergrund (ChatGPT-ähnlich, ruhig & konsistent).
// - Leicht gedämpfte Textfarbe für bessere Lesbarkeit auf dunklem Hintergrund.

import type {Metadata} from "next";
import "./globals.css";
import React from "react";
import {NuqsAdapter} from "nuqs/adapters/next/app";
import {ThemeProvider} from "@/providers/theme-provider";
import {Toaster} from "@/components/ui/sonner";

export const metadata: Metadata = {
    title: "Bachelorthesis - App",
    description: "Next.js App mit Management-Auth und Study Flow + Agent Chat UI.",
};

export default function RootLayout({children}: { children: React.ReactNode }) {
    return (
        <html lang="de" suppressHydrationWarning className="h-full">
        <body className="h-full bg-neutral-900 text-neutral-200 flex flex-col">
        {/* Ruhiger, neutraler Hintergrund ohne Glow / Farbverläufe */}
        <ThemeProvider>
            <Toaster/>
            <div className="flex-1 min-h-0 flex flex-col">
                <NuqsAdapter>{children}</NuqsAdapter>
            </div>
        </ThemeProvider>
        </body>
        </html>
    );
}
