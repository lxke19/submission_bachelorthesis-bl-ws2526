// app/(public)/study/layout.tsx
//
// Purpose:
// - Wrap all /study/* routes in a client-side StudySessionProvider.
// - This provider stores the study session token ONLY in memory.
//   => On hard reload, memory resets, token is gone, user must re-enter access code.
//
// Why this matters:
// - You explicitly want: reload => kick out => must re-enter access code.
// - We also want: direct navigation to /study/[code]/task/... must NOT reveal data.
//   So pages load all data via API calls that require the token.

import type {ReactNode} from "react";
import {StudySessionProvider} from "@/app/modules/publicStudy/StudySessionProvider";

export default function StudyLayout({children}: { children: ReactNode }) {
    return <StudySessionProvider>{children}</StudySessionProvider>;
}
