// app/modules/management/dashboard/components/format.ts
//
// Purpose:
// - Shared formatting helpers for the Management Overview UI.
// - Keeps the dashboard + modals consistent without passing functions as props.

export function formatDuration(ms: number | null): string {
    if (ms === null) return "—";
    const sec = Math.round(ms / 1000);
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    if (min <= 0) return `${rem}s`;
    return `${min}m ${rem}s`;
}

export function percent(p: number | null): string {
    if (p === null) return "—";
    return `${Math.round(p * 100)}%`;
}
