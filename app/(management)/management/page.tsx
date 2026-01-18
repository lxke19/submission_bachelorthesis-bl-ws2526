// app/(management)/management/page.tsx
//
// Einstieg in den Verwaltungsbereich.
// - Wenn bereits eingeloggt → Redirect zu /management/dashboard
// - Wenn noch kein User existiert → Setup-Form (Admin anlegen)
// - Wenn User existieren, aber keiner eingeloggt → Login-Form

import {redirect} from "next/navigation";
import {prisma} from "@/app/lib/prisma";
import {getCurrentUser} from "@/app/lib/auth";
import {ManagementAuthPageClient} from "@/app/modules/auth/components/ManagementAuthPageClient";

export default async function ManagementAuthPage() {
    const user = await getCurrentUser();
    if (user) {
        redirect("/management/dashboard");
    }

    const userCount = await prisma.user.count();
    const hasUser = userCount > 0;

    return <ManagementAuthPageClient hasUser={hasUser}/>;
}
