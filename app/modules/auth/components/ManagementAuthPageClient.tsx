"use client";

// app/modules/auth/components/ManagementAuthPageClient.tsx
//
// Client UI für:
// - Setup (erster Admin): TOTP initialisieren -> QR anzeigen -> registrieren
// - Login (wenn User existieren)
//
// Design: dunkles Rot (wie gewünscht), sauber & ohne externe UI-Libs.

import {useEffect, useMemo, useState} from "react";
import {useRouter} from "next/navigation";
import QRCode from "qrcode";
import {initTotpSetup, login, registerFirstAdmin} from "@/app/modules/auth/api";

type Props = {
    hasUser: boolean;
};

function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ManagementAuthPageClient({hasUser}: Props) {
    const router = useRouter();

    const [mode, setMode] = useState<"login" | "setup">(hasUser ? "login" : "setup");

    // Common form fields
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [totpCode, setTotpCode] = useState("");

    // Setup-only fields
    const [totpSecret, setTotpSecret] = useState<string>("");
    const [otpauthUrl, setOtpauthUrl] = useState<string>("");
    const [qrDataUrl, setQrDataUrl] = useState<string>("");

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>("");

    const title = useMemo(() => {
        if (mode === "setup") return "Ersteinrichtung (Admin anlegen)";
        return "Admin Login";
    }, [mode]);

    // Generate QR once we have otpauthUrl
    useEffect(() => {
        let cancelled = false;

        async function run() {
            if (!otpauthUrl) return;
            try {
                const dataUrl = await QRCode.toDataURL(otpauthUrl, {margin: 1, width: 220});
                if (!cancelled) setQrDataUrl(dataUrl);
            } catch {
                if (!cancelled) setQrDataUrl("");
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [otpauthUrl]);

    async function handleInitTotp() {
        setError("");
        if (!isEmail(username.trim())) {
            setError("Bitte eine gültige E-Mail-Adresse eingeben.");
            return;
        }
        setBusy(true);
        try {
            const res = await initTotpSetup(username.trim());
            if (!res.ok) {
                setError(res.error);
                return;
            }
            setTotpSecret(res.secret);
            setOtpauthUrl(res.otpauthUrl);
        } finally {
            setBusy(false);
        }
    }

    async function handleRegister() {
        setError("");

        const u = username.trim();
        if (!isEmail(u)) return setError("Bitte eine gültige E-Mail-Adresse eingeben.");
        if (password.length < 8) return setError("Passwort muss mindestens 8 Zeichen haben.");
        if (!totpSecret) return setError("Bitte zuerst TOTP initialisieren.");
        if (!totpCode.trim()) return setError("Bitte den TOTP-Code eingeben.");

        setBusy(true);
        try {
            const res = await registerFirstAdmin(u, password, totpSecret, totpCode.trim());
            if (!res.ok) {
                setError(res.error);
                return;
            }
            router.push("/management/dashboard");
            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    async function handleLogin() {
        setError("");

        const u = username.trim();
        if (!isEmail(u)) return setError("Bitte eine gültige E-Mail-Adresse eingeben.");
        if (!password) return setError("Bitte Passwort eingeben.");
        // totpCode kann leer sein, wenn der User kein 2FA aktiviert hat - Server entscheidet.

        setBusy(true);
        try {
            const res = await login(u, password, totpCode.trim());
            if (!res.ok) {
                setError(res.error);
                return;
            }
            router.push("/management/dashboard");
            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-[70vh] flex items-center justify-center">
            <div className="w-full max-w-xl rounded-2xl border border-rose-900/40 bg-black/30 p-6 shadow-xl">
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
                    <p className="text-sm text-slate-300">
                        {mode === "setup"
                            ? "Lege den ersten Admin an (inkl. verpflichtender Zwei-Faktor-Authentifizierung)."
                            : "Melde dich mit deinem Admin-Konto an."}
                    </p>
                </div>

                <div className="mt-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm text-slate-200">E-Mail</label>
                        <input
                            className="w-full rounded-lg border border-rose-900/40 bg-slate-950 px-3 py-2 text-slate-50 outline-none focus:border-rose-500"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin@example.org"
                            autoComplete="email"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm text-slate-200">Passwort</label>
                        <input
                            className="w-full rounded-lg border border-rose-900/40 bg-slate-950 px-3 py-2 text-slate-50 outline-none focus:border-rose-500"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            type="password"
                            autoComplete={mode === "login" ? "current-password" : "new-password"}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm text-slate-200">2FA Code (TOTP)</label>
                        <input
                            className="w-full rounded-lg border border-rose-900/40 bg-slate-950 px-3 py-2 text-slate-50 outline-none focus:border-rose-500"
                            value={totpCode}
                            onChange={(e) => setTotpCode(e.target.value)}
                            placeholder="123456"
                            inputMode="numeric"
                        />
                        <p className="text-xs text-slate-400">
                            Hinweis: Wenn dein User kein 2FA aktiviert hat, kann dieses Feld leer bleiben.
                        </p>
                    </div>

                    {mode === "setup" && (
                        <div className="rounded-xl border border-rose-900/30 bg-slate-950/40 p-4 space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-100">2FA einrichten</p>
                                    <p className="text-xs text-slate-400">
                                        Erst Secret erzeugen, dann QR scannen, dann Code eingeben.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={handleInitTotp}
                                    className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-60"
                                >
                                    {busy ? "…" : "TOTP initialisieren"}
                                </button>
                            </div>

                            {otpauthUrl && (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                    <div className="rounded-lg border border-rose-900/30 bg-black/30 p-3">
                                        {qrDataUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={qrDataUrl} alt="TOTP QR Code" className="h-[220px] w-[220px]"/>
                                        ) : (
                                            <p className="text-xs text-slate-300">
                                                QR konnte nicht erzeugt werden. Nutze die otpauth URL unten manuell.
                                            </p>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-2">
                                        <p className="text-xs text-slate-300 break-all">
                                            <span className="font-semibold text-slate-200">Secret:</span>{" "}
                                            {totpSecret}
                                        </p>
                                        <p className="text-xs text-slate-300 break-all">
                                            <span className="font-semibold text-slate-200">otpauth:</span>{" "}
                                            {otpauthUrl}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div
                            className="rounded-lg border border-rose-900/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            {hasUser && (
                                <>
                                    <button
                                        type="button"
                                        className={`text-sm underline underline-offset-4 ${
                                            mode === "login" ? "text-rose-200" : "text-slate-400"
                                        }`}
                                        onClick={() => setMode("login")}
                                    >
                                        Login
                                    </button>
                                    <span className="text-slate-600">|</span>
                                    <button
                                        type="button"
                                        className={`text-sm underline underline-offset-4 ${
                                            mode === "setup" ? "text-rose-200" : "text-slate-400"
                                        }`}
                                        onClick={() => setMode("setup")}
                                    >
                                        Setup
                                    </button>
                                </>
                            )}
                        </div>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={mode === "setup" ? handleRegister : handleLogin}
                            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-60"
                        >
                            {mode === "setup" ? "Admin anlegen" : "Login"}
                        </button>
                    </div>

                    <div className="pt-2">
                        <p className="text-xs text-slate-500">
                            Hinweis: Nach erfolgreichem Login/Setup wirst du auf{" "}
                            <code className="rounded bg-black/40 px-1 py-0.5 text-slate-300">
                                /management/dashboard
                            </code>{" "}
                            weitergeleitet.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
