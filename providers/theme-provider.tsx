"use client";

import * as React from "react";
import {ThemeProvider as NextThemesProvider} from "next-themes";

/**
 * App-wide ThemeProvider (next-themes)
 * - Toaster (sonner) nutzt useTheme(), darum muss das hier clientseitig existieren.
 * - attribute="class": schreibt class="dark" auf <html>, kompatibel mit shadcn tokens.
 */
export function ThemeProvider({children}: { children: React.ReactNode }) {
    return (
        <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
        </NextThemesProvider>
    );
}
