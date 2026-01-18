// app/(management)/management/(protected)/participants/page.tsx
//
// Purpose:
// - Management list view for participants.
// - Provide search + study filter + status filter.
// - Link to create and details.
//
// Why server page:
// - Keeps initial listing fast and SEO-neutral.
// - Uses Prisma directly (no client secrets, no extra round trip required for first render).

import Link from "next/link";
import {prisma} from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = {
    q?: string;
    studyId?: string;
    status?: string;
};

export default async function ManagementParticipantsPage({
                                                             searchParams,
                                                         }: {
    searchParams: Promise<SearchParams>;
}) {
    const sp = await searchParams;
    const q = (sp.q ?? "").trim();
    const studyId = (sp.studyId ?? "").trim();
    const status = (sp.status ?? "").trim();

    const studies = await prisma.study.findMany({
        select: {id: true, key: true, name: true},
        orderBy: [{createdAt: "desc"}],
    });

    const where: any = {};
    if (studyId) where.studyId = studyId;
    if (status) where.status = status;
    if (q) {
        where.OR = [
            {accessCode: {contains: q, mode: "insensitive"}},
            {participantLabel: {contains: q, mode: "insensitive"}},
        ];
    }

    const participants = await prisma.participant.findMany({
        where,
        take: 100,
        orderBy: [{createdAt: "desc"}],
        select: {
            id: true,
            accessCode: true,
            participantLabel: true,
            status: true,
            currentStep: true,
            assignedVariant: true,
            sidePanelEnabled: true,
            startedAt: true,
            completedAt: true,
            lastActiveAt: true,
            reentryCount: true,
            createdAt: true,
            study: {select: {id: true, key: true, name: true}},
        },
    });

    const newHref = studyId
        ? `/management/participants/new?studyId=${encodeURIComponent(studyId)}`
        : "/management/participants/new";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Participants</h1>
                    <p className="text-sm text-slate-300">
                        Search by access code or label, filter by study/status, and open details.
                    </p>
                </div>

                <Link
                    href={newHref}
                    className="rounded-xl border border-rose-900/40 bg-black/20 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-rose-900/25"
                >
                    + New participant
                </Link>
            </div>

            {/* Filters */}
            <form className="rounded-2xl border border-rose-900/30 bg-black/25 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-200">Search (accessCode / label)</label>
                        <input
                            name="q"
                            defaultValue={q}
                            placeholder="e.g. 3f6c… or P001"
                            className="w-full rounded-lg border border-rose-900/30 bg-black/20 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-200">Study</label>
                        <select
                            name="studyId"
                            defaultValue={studyId}
                            className="w-full rounded-lg border border-rose-900/30 bg-black/20 px-3 py-2 text-sm text-slate-50"
                        >
                            <option value="">All studies</option>
                            {studies.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.key} — {s.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-200">Status</label>
                        <select
                            name="status"
                            defaultValue={status}
                            className="w-full rounded-lg border border-rose-900/30 bg-black/20 px-3 py-2 text-sm text-slate-50"
                        >
                            <option value="">All</option>
                            <option value="CREATED">CREATED</option>
                            <option value="STARTED">STARTED</option>
                            <option value="COMPLETED">COMPLETED</option>
                            <option value="WITHDRAWN">WITHDRAWN</option>
                            <option value="INVALIDATED">INVALIDATED</option>
                        </select>
                    </div>

                    <div className="flex items-end gap-2">
                        <button
                            type="submit"
                            className="rounded-lg border border-rose-900/40 bg-black/20 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-rose-900/25"
                        >
                            Apply
                        </button>

                        <Link
                            href="/management/participants"
                            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-rose-900/25 hover:text-rose-100"
                        >
                            Reset
                        </Link>
                    </div>
                </div>
            </form>

            {/* List */}
            <div className="overflow-hidden rounded-2xl border border-rose-900/30 bg-black/25">
                <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-black/30 text-slate-200">
                    <tr className="[&>th]:px-4 [&>th]:py-3">
                        <th>Label</th>
                        <th>Access code</th>
                        <th>Study</th>
                        <th>Variant</th>
                        <th>Side panel</th>
                        <th>Status</th>
                        <th>Step</th>
                        <th>Last active</th>
                    </tr>
                    </thead>
                    <tbody className="text-slate-100">
                    {participants.length === 0 ? (
                        <tr>
                            <td className="px-4 py-6 text-slate-300" colSpan={8}>
                                No participants found for the current filters.
                            </td>
                        </tr>
                    ) : (
                        participants.map((p) => (
                            <tr key={p.id} className="border-t border-rose-900/20 [&>td]:px-4 [&>td]:py-3">
                                <td className="text-slate-200">
                                    {p.participantLabel ?? <span className="text-slate-500">—</span>}
                                </td>
                                <td className="font-mono text-xs">
                                    <Link
                                        href={`/management/participants/${p.id}`}
                                        className="text-rose-100 hover:underline"
                                        title="Open details"
                                    >
                                        {p.accessCode}
                                    </Link>
                                </td>
                                <td className="text-slate-200">
                                    {p.study.key}
                                    <span className="text-slate-500"> — {p.study.name}</span>
                                </td>
                                <td>{p.assignedVariant}</td>
                                <td>{p.sidePanelEnabled ? "enabled" : "disabled"}</td>
                                <td>{p.status}</td>
                                <td className="text-slate-200">{p.currentStep}</td>
                                <td className="text-slate-300">
                                    {p.lastActiveAt ? new Date(p.lastActiveAt).toLocaleString() : "—"}
                                </td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
