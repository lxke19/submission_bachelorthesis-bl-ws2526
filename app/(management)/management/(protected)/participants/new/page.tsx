// app/(management)/management/(protected)/participants/new/page.tsx
//
// Purpose:
// - Create exactly one participant (no bulk).
// - Study can be preselected via ?studyId=... (e.g. "Create participant from Study").
//
// Why client form:
// - We want a clean “submit → create → redirect to details” UX using the management API.

import {prisma} from "@/app/lib/prisma";
import ParticipantCreateClient from "@/app/modules/management/participants/components/ParticipantCreateClient";

export const dynamic = "force-dynamic";

export default async function ManagementParticipantCreatePage({
                                                                  searchParams,
                                                              }: {
    searchParams: Promise<{ studyId?: string }>;
}) {
    const sp = await searchParams;
    const preselectedStudyId = (sp.studyId ?? "").trim();

    const studies = await prisma.study.findMany({
        select: {id: true, key: true, name: true},
        orderBy: [{createdAt: "desc"}],
    });

    return (
        <ParticipantCreateClient
            studies={studies}
            preselectedStudyId={preselectedStudyId || null}
        />
    );
}
