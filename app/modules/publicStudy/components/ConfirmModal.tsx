"use client";

// app/modules/publicStudy/components/ConfirmModal.tsx
//
// Purpose:
// - Mandatory confirmation modal (Yes/No) for critical navigation / submissions.
// - Centered dialog with dimmed background.
// - Cannot be dismissed by clicking outside or pressing ESC.
// - User must explicitly choose Yes or No.
//
// Why:
// - Prevent accidental submissions / irreversible navigation in the public study flow.
//
// Notes:
// - Best-effort body scroll lock while open.
// - Uses existing shadcn-style Button component.

import React, {useEffect, useRef} from "react";
import {Button} from "@/components/ui/button";

export default function ConfirmModal(props: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmLoading?: boolean;
    onConfirmAction: () => void;
    onCancelAction: () => void;
}) {
    const {
        open,
        title,
        description,
        confirmLabel = "Ja",
        cancelLabel = "Nein",
        confirmLoading = false,
        onConfirmAction,
        onCancelAction,
    } = props;

    const panelRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    // Best-effort: lock background scroll + keep focus within modal.
    useEffect(() => {
        if (!open) return;

        previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        // Focus the modal panel (so keyboard navigation starts inside).
        window.setTimeout(() => {
            panelRef.current?.focus();
        }, 0);

        return () => {
            document.body.style.overflow = prevOverflow;
            previouslyFocused.current?.focus?.();
        };
    }, [open]);

    // Prevent ESC from closing (mandatory decision).
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        window.addEventListener("keydown", onKeyDown, {capture: true});
        return () => window.removeEventListener("keydown", onKeyDown, {capture: true} as any);
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            aria-hidden={false}
        >
            {/* Backdrop: dim background, do NOT close on click */}
            <div
                className="absolute inset-0 bg-black/75"
                aria-hidden="true"
            />

            {/* Modal Panel */}
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={[
                    "relative mx-4 w-full max-w-lg",
                    // Softer, darker red palette + less “bright white” contrast
                    "rounded-2xl border border-rose-500/25",
                    "bg-rose-950/70",
                    "p-5 shadow-xl backdrop-blur-md",
                    "outline-none",
                ].join(" ")}
                // Important: do NOT close on outside click, and clicking inside should not propagate to backdrop.
                onClick={(e) => e.stopPropagation()}
            >
                {/* Subtle top accent bar (keeps it “red” but not loud) */}
                <div
                    className="absolute left-5 right-5 top-0 h-px bg-gradient-to-r from-transparent via-rose-400/30 to-transparent"/>

                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-rose-50/90">{title}</h2>
                    <p className="text-sm leading-relaxed text-rose-100/70">{description}</p>
                </div>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        // Much softer “white”, more muted and consistent with the red theme
                        className={[
                            "border-rose-400/25 bg-transparent",
                            "text-rose-100/80 hover:text-rose-50",
                            "hover:bg-white/5",
                        ].join(" ")}
                        disabled={confirmLoading}
                        onClick={() => onCancelAction()}
                    >
                        {cancelLabel}
                    </Button>

                    <Button
                        type="button"
                        // Keep default button structure, but tint it towards dark red and reduce glare
                        className={[
                            "bg-rose-900/60 text-rose-50/90",
                            "hover:bg-rose-900/80",
                            "border border-rose-400/20",
                        ].join(" ")}
                        disabled={confirmLoading}
                        onClick={() => onConfirmAction()}
                    >
                        {confirmLoading ? "Bitte warten..." : confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
