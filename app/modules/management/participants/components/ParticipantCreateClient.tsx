"use client";

// app/modules/management/participants/components/ParticipantCreateClient.tsx
//
// Purpose:
// - Create a single participant (no bulk).
// - Study can be preselected (e.g. coming from a Study page).
//
// Why this is client-side:
// - We want immediate validation feedback and a “submit → redirect” flow.

import {useMemo, useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {createParticipant} from "@/app/modules/management/participants/api";

type StudyListItem = { id: string; key: string; name: string };

export default function ParticipantCreateClient({
                                                    studies,
                                                    preselectedStudyId,
                                                }: {
    studies: StudyListItem[];
    preselectedStudyId: string | null;
}) {
    const router = useRouter();

    const [studyId, setStudyId] = useState(preselectedStudyId ?? "");
    const [assignedVariant, setAssignedVariant] = useState<"VARIANT_1" | "VARIANT_2">("VARIANT_1");
    const [participantLabel, setParticipantLabel] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const sidePanelEnabled = useMemo(() => assignedVariant === "VARIANT_2", [assignedVariant]);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!studyId) {
            toast.error("Please select a study.");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await createParticipant({
                studyId,
                assignedVariant,
                participantLabel: participantLabel.trim() ? participantLabel.trim() : undefined,
            });

            if (!res.ok) {
                toast.error(res.error);
                return;
            }

            toast.success("Participant created.");
            router.push(`/management/participants/${res.participant.id}`);
            router.refresh();
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Create participant</h1>
                <p className="text-sm text-slate-300">
                    Creates exactly one participant. Side panel is automatically coupled to the chosen variant.
                </p>
            </div>

            <form onSubmit={onSubmit} className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-200">Study</label>
                        <select
                            value={studyId}
                            onChange={(e) => setStudyId(e.target.value)}
                            className="w-full rounded-lg border border-rose-900/30 bg-black/20 px-3 py-2 text-sm text-slate-50"
                        >
                            <option value="">Select a study…</option>
                            {studies.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.key} — {s.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-200">Participant label (optional)</label>
                        <input
                            value={participantLabel}
                            onChange={(e) => setParticipantLabel(e.target.value)}
                            placeholder='e.g. "P001"'
                            className="w-full rounded-lg border border-rose-900/30 bg-black/20 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500"
                        />
                        <p className="text-xs text-slate-400">
                            If provided, it is intended to be unique per study (schema constraint).
                        </p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-200">Variant</label>
                        <select
                            value={assignedVariant}
                            onChange={(e) => setAssignedVariant(e.target.value as any)}
                            className="w-full rounded-lg border border-rose-900/30 bg-black/20 px-3 py-2 text-sm text-slate-50"
                        >
                            <option value="VARIANT_1">VARIANT_1</option>
                            <option value="VARIANT_2">VARIANT_2</option>
                        </select>
                        <p className="text-xs text-slate-400">
                            You assign the variant manually (no auto-balancing).
                        </p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-200">Side panel (derived)</label>
                        <div
                            className="rounded-lg border border-rose-900/30 bg-black/20 px-3 py-2 text-sm text-slate-200">
                            {sidePanelEnabled ? "enabled (VARIANT_2)" : "disabled (VARIANT_1)"}
                        </div>
                        <p className="text-xs text-slate-400">
                            Side panel is strongly coupled to the variant to keep the manipulation consistent.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-xl border border-rose-900/40 bg-black/20 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-rose-900/25 disabled:opacity-60"
                    >
                        {isSubmitting ? "Creating…" : "Create"}
                    </button>

                    <button
                        type="button"
                        onClick={() => router.push("/management/participants")}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-rose-900/25 hover:text-rose-100"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}
