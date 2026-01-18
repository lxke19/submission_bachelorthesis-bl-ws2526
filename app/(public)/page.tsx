// app/(public)/page.tsx
//
// Öffentliche Startseite.
// Ziel: Begrüßung + klare, verständliche Einordnung der Studie und der Daten.
// Hinweis zum Reload (Code erneut eingeben) kommt bewusst NICHT hier, sondern auf /study.

"use client";

import Link from "next/link";
import {useMemo, useState} from "react";

type Lang = "de" | "en";

export default function PublicHomePage() {
    const [lang, setLang] = useState<Lang>("de");

    const copy = useMemo(() => {
        if (lang === "en") {
            return {
                h1: "Welcome to the study",
                intro: (
                    <>
                        In this study you will complete <strong>three tasks in a row</strong>. You will work with a
                        chat assistant that can retrieve information from an underlying <strong>dataset</strong>. You
                        ask questions in the chat, check the answer - and then submit your solution.
                    </>
                ),
                languagePickerLabel: "Read this page in:",
                languageDe: "Deutsch",
                languageEn: "English",

                quickStartTitle: "What you need to do",
                quickStartBullets: [
                    <>
                        You will receive <strong>3 tasks</strong> (one after another).
                    </>,
                    <>
                        You solve each task by asking the assistant questions{" "}
                        <strong>step by step</strong>.
                    </>,
                    <>
                        You may ask <strong>as many follow-up questions</strong> as you want and{" "}
                        <strong>restart the chat</strong> as often as you like.
                    </>,
                    <>
                        Under the assistant’s answers you will see a <strong>Data Details / Source</strong> box. Use it
                        to check <strong>where the information comes from</strong> and whether the assistant actually
                        used the relevant data.
                    </>,
                    <>
                        Once you have enough information, click <strong>“Ready to answer”</strong> and submit your
                        solution.
                    </>,
                ],

                languageNoteLabel: "Language:",
                languageNote: (
                    <>
                        The study itself (task descriptions, surveys and answer options) is{" "}
                        <span className="font-semibold text-slate-200">in English</span>. However, you may chat with the
                        assistant{" "}
                        <span className="font-semibold text-slate-200">in any language</span>. You may submit your
                        answers{" "}
                        <span className="font-semibold text-slate-200">in English or German</span>.
                    </>
                ),

                aboutTitle: "What is this about?",
                aboutText: (
                    <>
                        The goal is not to solve everything at once, but to work through the tasks{" "}
                        <strong>step by step</strong> together with the assistant: ask questions, check results, and if
                        needed start over - until you are satisfied, or a task does not seem meaningfully solvable for
                        you.
                    </>
                ),

                assistantTitle: "How does the assistant help you?",
                assistantBullets: [
                    "The assistant can retrieve information from the dataset (e.g., companies, years, or measured values).",
                    "Under answers you will see a Data Details / Source box showing which data was used. This helps you judge whether the answer is well supported.",
                    "If you are unsure: ask again, request clarification, or restart the chat.",
                ],
                sourceBoxTitle: "Example: Data Details / Source box",
                sourceBoxHint:
                    "This box appears under assistant answers. Use it to verify which data was used.",
                sourceBoxAlt: "Example screenshot of the Data Details / Source box",

                dataTitle: "What data is used?",
                dataText: (
                    <>
                        The dataset is based on a scientifically created ESG dataset covering the{" "}
                        <strong>600 largest listed companies in Europe</strong> (STOXX Europe 600). It contains{" "}
                        <strong>501 quantitative indicators</strong> across environmental, social and governance topics.
                        Values were automatically extracted from company reports (annual and sustainability reports) and
                        then structured for analysis (Forster et al., 2025).
                    </>
                ),
                dataNote:
                    "Note: Missing values do not necessarily mean “errors” - often an indicator is simply not reported for a specific company/year.",
                structureTitle: "Data structure (for the Data Details / Source box)",
                structureText:
                    "You do not need to know these names - they are only helpful when checking whether the assistant used the right data.",
                tablesTitle: "Database tables (3)",
                tables: [
                    {
                        name: "esg.companies",
                        desc: "Company information (e.g., name, country)",
                    },
                    {
                        name: "esg.indicator_metadata",
                        desc: "Indicator descriptions (what exactly is measured)",
                    },
                    {
                        name: "esg.esg_indicators_postprocessed",
                        desc: "The actual measurements (value, unit, year/period, etc.)",
                    },
                ],

                creditTitle: "Source / Credit",
                creditText: (
                    <>
                        The ESG dataset used here was created and publicly released as part of the working paper{" "}
                        <em>“Assessing corporate sustainability with large language models: Evidence from
                            Europe”</em>{" "}
                        (Forster et al., 2025).
                    </>
                ),
                creditNote: "Full reference (APA-7) is shown below.",

                flowTitle: "How does the study work?",
                flowItems: [
                    <>
                        <strong>Start survey</strong> (short pre-survey)
                    </>,
                    <>
                        <strong>Task 1</strong> - get familiar with the dataset (with chat) + short post-survey
                    </>,
                    <>
                        <strong>Task 2</strong> - analysis task (with chat) + short post-survey
                    </>,
                    <>
                        <strong>Task 3</strong> - analysis task (with chat) + short post-survey
                    </>,
                    <>
                        <strong>Final survey</strong> (overall feedback)
                    </>,
                ],

                chatTitle: "Important when chatting",
                chatBullets: [
                    "Within a task you can restart at any time or start a new chat.",
                    "Work iteratively: understand → ask targeted questions → check results → refine.",
                    <>
                        Tasks and surveys are in <strong>English</strong>, but you may write to the assistant{" "}
                        <strong>in any language</strong>. Answers may be submitted in{" "}
                        <strong>English or German</strong>.
                    </>,
                    <>
                        When you have enough information, click <strong>“Ready to answer”</strong> and submit your
                        solution.
                    </>,
                ],

                privacyTitle: "Privacy & consent",
                privacyBullets: [
                    <>
                        Please keep your <strong>access code</strong> private and do not share it.
                    </>,
                    "Only study-relevant information is collected and stored for analysis. It is not intended to link your data to your real identity.",
                    "Please do not enter personal data in the chat.",
                ],
                privacyText: (
                    <>
                        By clicking <strong>“Start study”</strong>, you agree to the{" "}
                        <strong>collection and analysis</strong> of your study participation data (e.g., answers, chat
                        interactions, completion times).
                    </>
                ),

                startButton: "Start study (enter access code)",

                litTitle: "References (APA-7):",
            };
        }

        return {
            h1: "Willkommen zur Studie",
            intro: (
                <>
                    Du bearbeitest in dieser Studie <strong>drei Aufgaben nacheinander</strong>. Dafür nutzt du einen
                    Chat-Assistenten, der Informationen aus einem <strong>zugrunde liegenden Datensatz</strong>{" "}
                    abrufen kann. Du stellst Fragen im Chat, prüfst die Antwort - und gibst anschließend deine Lösung
                    ab.
                </>
            ),
            languagePickerLabel: "Diese Seite lesen auf:",
            languageDe: "Deutsch",
            languageEn: "English",

            quickStartTitle: "Was du konkret tun musst",
            quickStartBullets: [
                <>
                    Du bekommst <strong>3 Aufgaben</strong> (eine nach der anderen).
                </>,
                <>
                    Du löst jede Aufgabe, indem du dem Assistenten im Chat{" "}
                    <strong>Schritt für Schritt Fragen stellst</strong>.
                </>,
                <>
                    Du darfst <strong>so oft nachfragen</strong> und den Chat{" "}
                    <strong>so oft neu starten</strong>, wie du möchtest.
                </>,
                <>
                    Unter den Antworten zeigt der Assistent eine <strong>Quelle / Data Details</strong>-Box. Nutze sie,
                    um zu sehen, <strong>woher die Information kommt</strong> und ob der Assistent wirklich die
                    passenden Daten verwendet hat.
                </>,
                <>
                    Wenn du genug Informationen gesammelt hast, klicke auf{" "}
                    <strong>„Bereit zum Antworten“</strong> und gib deine Lösung ab.
                </>,
            ],

            languageNoteLabel: "Sprache:",
            languageNote: (
                <>
                    Die Studie selbst (Aufgabenstellungen, Fragebögen und Antwortoptionen) ist{" "}
                    <span className="font-semibold text-slate-200">auf Englisch</span>. Du kannst aber mit dem
                    Assistenten{" "}
                    <span className="font-semibold text-slate-200">in jeder Sprache</span> chatten. Antworten kannst
                    du{" "}
                    <span className="font-semibold text-slate-200">auf Englisch oder Deutsch</span> geben.
                </>
            ),

            aboutTitle: "Worum geht es?",
            aboutText: (
                <>
                    Ziel ist nicht, dass du „alles auf einmal“ löst, sondern dass du die Aufgaben{" "}
                    <strong>Schritt für Schritt</strong> gemeinsam mit dem Assistenten bearbeitest: Fragen stellen,
                    Ergebnisse prüfen, ggf. neu ansetzen - bis du zufrieden bist oder eine Aufgabe für dich nicht
                    sinnvoll lösbar erscheint.
                </>
            ),

            assistantTitle: "Wie hilft dir der Assistent?",
            assistantBullets: [
                "Der Assistent kann Informationen aus dem Datensatz abrufen (z. B. zu Unternehmen, Jahren oder Messwerten).",
                "Unter Antworten gibt es eine Data Details / Source-Box, die zeigt, welche Daten verwendet wurden. Das hilft dir zu beurteilen, ob die Antwort gut begründet ist.",
                "Wenn du unsicher bist: Frage nach, bitte um Präzisierung oder starte einen neuen Chat.",
            ],
            sourceBoxTitle: "Beispiel: Data Details / Source-Box",
            sourceBoxHint:
                "Diese Box erscheint unter den Antworten des Assistenten. Nutze sie, um zu prüfen, welche Daten verwendet wurden.",
            sourceBoxAlt: "Beispiel-Screenshot der Data Details / Source-Box",

            dataTitle: "Welche Daten liegen zugrunde?",
            dataText: (
                <>
                    Die Datengrundlage basiert auf einem wissenschaftlich erstellten ESG-Datensatz zu den{" "}
                    <strong>600 größten börsennotierten Unternehmen Europas</strong> (STOXX Europe 600). Enthalten
                    sind{" "}
                    <strong>501 quantitative Indikatoren</strong> zu Umwelt-, Sozial- und Governance-Themen. Die Werte
                    wurden aus Unternehmensberichten (Annual- und Sustainability-Reports) automatisch extrahiert und
                    anschließend strukturiert bereitgestellt (Forster et al., 2025).
                </>
            ),
            dataNote:
                "Hinweis: Fehlende Werte bedeuten nicht zwingend „Fehler“ - häufig wird ein Indikator in einem bestimmten Unternehmen/Jahr schlicht nicht berichtet (z. B. fehlende Relevanz/Materialität).",
            structureTitle: "Datenstruktur (für die Data Details / Source-Box)",
            structureText:
                "Du musst diese Namen nicht kennen - sie helfen dir nur dabei zu prüfen, ob der Assistent die passenden Daten verwendet hat.",
            tablesTitle: "Datenbanktabellen (3)",
            tables: [
                {
                    name: "esg.companies",
                    desc: "Informationen zu Unternehmen (z. B. Land, Name)",
                },
                {
                    name: "esg.indicator_metadata",
                    desc: "Beschreibung der Indikatoren (was genau gemessen wird)",
                },
                {
                    name: "esg.esg_indicators_postprocessed",
                    desc: "die eigentlichen Messwerte (Wert, Einheit, Jahr/Zeitraum usw.)",
                },
            ],

            creditTitle: "Quelle / Credit",
            creditText: (
                <>
                    Der verwendete ESG-Datensatz wurde im Rahmen des Working Papers{" "}
                    <em>“Assessing corporate sustainability with large language models: Evidence from Europe”</em>{" "}
                    erstellt und öffentlich bereitgestellt (Forster et al., 2025).
                </>
            ),
            creditNote: "Vollständige Referenz (APA-7) siehe unten.",

            flowTitle: "Wie läuft die Studie ab?",
            flowItems: [
                <>
                    <strong>Startbefragung</strong> (kurze Pre-Survey)
                </>,
                <>
                    <strong>Task 1</strong> - den Datensatz kennenlernen (mit Chat) + kurze Nachbefragung
                </>,
                <>
                    <strong>Task 2</strong> - Analyseaufgabe (mit Chat) + kurze Nachbefragung
                </>,
                <>
                    <strong>Task 3</strong> - Analyseaufgabe (mit Chat) + kurze Nachbefragung
                </>,
                <>
                    <strong>Abschlussbefragung</strong> (Final Survey)
                </>,
            ],

            chatTitle: "Wichtig beim Chat",
            chatBullets: [
                "Du kannst innerhalb einer Aufgabe jederzeit neu starten oder einen neuen Chat beginnen.",
                "Arbeite iterativ: erst verstehen → dann gezielt abfragen → Ergebnisse prüfen → verfeinern.",
                <>
                    Die Aufgabenstellungen und Fragebögen sind auf <strong>Englisch</strong>, aber du darfst mit dem
                    Assistenten <strong>in jeder Sprache</strong> schreiben. Antworten sind auf{" "}
                    <strong>Englisch oder Deutsch</strong> möglich.
                </>,
                <>
                    Wenn du genug Informationen gesammelt hast, klicke auf <strong>„Bereit zum Antworten“</strong> und
                    gib deine Lösung ab.
                </>,
            ],

            privacyTitle: "Datenschutz & Einwilligung",
            privacyBullets: [
                <>
                    Bitte behalte deinen <strong>Access-Code</strong> für dich und teile ihn nicht mit anderen.
                </>,
                "Es werden nur studienrelevante Angaben erhoben und für die Auswertung gespeichert. Eine Zuordnung zu deiner realen Identität ist nicht vorgesehen.",
                "Bitte gib im Chat keine personenbezogenen Daten ein.",
            ],
            privacyText: (
                <>
                    Mit dem Klick auf <strong>„Studie starten“</strong> erklärst du dich mit der{" "}
                    <strong>Erhebung und Auswertung</strong> deiner Studienteilnahme-Daten (z. B. Antworten,
                    Interaktionen im Chat, Bearbeitungszeiten) einverstanden.
                </>
            ),

            startButton: "Studie starten (Access-Code eingeben)",

            litTitle: "Literatur (APA-7):",
        };
    }, [lang]);

    return (
        <div className="space-y-8 py-8">
            <section className="space-y-3">
                {/* NEW: Language picker */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-slate-300">
                        <span className="font-semibold text-slate-200">{copy.languagePickerLabel}</span>
                    </div>

                    <div className="inline-flex rounded-xl border border-slate-700/30 bg-black/20 p-1">
                        <button
                            type="button"
                            onClick={() => setLang("de")}
                            aria-pressed={lang === "de"}
                            className={[
                                "px-3 py-1.5 text-sm font-semibold rounded-lg transition",
                                lang === "de"
                                    ? "bg-slate-800/60 text-slate-50"
                                    : "text-slate-300 hover:text-slate-100",
                            ].join(" ")}
                        >
                            {copy.languageDe}
                        </button>
                        <button
                            type="button"
                            onClick={() => setLang("en")}
                            aria-pressed={lang === "en"}
                            className={[
                                "px-3 py-1.5 text-sm font-semibold rounded-lg transition",
                                lang === "en"
                                    ? "bg-slate-800/60 text-slate-50"
                                    : "text-slate-300 hover:text-slate-100",
                            ].join(" ")}
                        >
                            {copy.languageEn}
                        </button>
                    </div>
                </div>

                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-50">{copy.h1}</h1>

                <p className="text-slate-200 max-w-3xl">{copy.intro}</p>

                {/* Quick start */}
                <div
                    className="rounded-2xl border border-slate-700/30 bg-black/20 p-4 text-sm text-slate-300 space-y-2">
                    <div className="font-semibold text-slate-200">{copy.quickStartTitle}</div>
                    <ul className="list-disc pl-5 space-y-1">
                        {copy.quickStartBullets.map((b, i) => (
                            <li key={i}>{b}</li>
                        ))}
                    </ul>
                </div>

                {/* Language note */}
                <div className="rounded-2xl border border-slate-700/30 bg-black/20 p-4 text-sm text-slate-300">
                    <span className="font-semibold text-slate-200">{copy.languageNoteLabel}</span>{" "}
                    {copy.languageNote}
                </div>
            </section>

            <section className="rounded-2xl border border-rose-900/30 bg-black/25 p-5 space-y-6">
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-100">{copy.aboutTitle}</h2>
                    <p className="text-sm text-slate-300 leading-relaxed">{copy.aboutText}</p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-100">{copy.assistantTitle}</h2>
                    <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
                        {copy.assistantBullets.map((b, i) => (
                            <li key={i}>{b}</li>
                        ))}
                    </ul>

                    {/* NEW: Source box image (only image requested) */}
                    <div className="mt-3 rounded-2xl border border-slate-700/30 bg-black/20 p-4 space-y-2">
                        <div className="text-sm font-semibold text-slate-200">{copy.sourceBoxTitle}</div>
                        <p className="text-sm text-slate-300 leading-relaxed">{copy.sourceBoxHint}</p>
                        <div className="overflow-hidden rounded-xl border border-slate-700/30 bg-black/30">
                            <img
                                src="/images/source-box.png"
                                alt={copy.sourceBoxAlt}
                                className="w-full h-auto block"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-100">{copy.dataTitle}</h2>
                    <p className="text-sm text-slate-300 leading-relaxed">{copy.dataText}</p>

                    <p className="text-xs text-slate-400 leading-relaxed">{copy.dataNote}</p>

                    <div className="mt-3 rounded-2xl border border-slate-700/30 bg-black/20 p-4">
                        <div className="text-sm font-semibold text-slate-200">{copy.structureTitle}</div>
                        <p className="mt-2 text-sm text-slate-300 leading-relaxed">{copy.structureText}</p>

                        <div className="mt-3 text-sm font-semibold text-slate-200">{copy.tablesTitle}</div>
                        <ul className="mt-2 space-y-1 text-sm text-slate-300 list-disc pl-5">
                            {copy.tables.map((t) => (
                                <li key={t.name}>
                                    <span className="font-semibold text-slate-200">{t.name}</span> - {t.desc}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="mt-3 rounded-2xl border border-slate-700/30 bg-black/20 p-4">
                        <div className="text-sm font-semibold text-slate-200">{copy.creditTitle}</div>
                        <p className="mt-2 text-sm text-slate-300 leading-relaxed">{copy.creditText}</p>
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">{copy.creditNote}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-100">{copy.flowTitle}</h2>
                    <ol className="text-sm text-slate-300 list-decimal pl-5 space-y-1">
                        {copy.flowItems.map((it, i) => (
                            <li key={i}>{it}</li>
                        ))}
                    </ol>
                </div>

                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-100">{copy.chatTitle}</h2>
                    <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
                        {copy.chatBullets.map((b, i) => (
                            <li key={i}>{b}</li>
                        ))}
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-100">{copy.privacyTitle}</h2>
                    <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
                        {copy.privacyBullets.map((b, i) => (
                            <li key={i}>{b}</li>
                        ))}
                    </ul>

                    <p className="text-sm text-slate-300 leading-relaxed">{copy.privacyText}</p>
                </div>

                <div className="pt-2">
                    <Link
                        href="/study"
                        className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-rose-900/40 bg-rose-900/20 px-4 py-3 text-sm font-semibold text-slate-50 hover:bg-rose-900/30"
                    >
                        {copy.startButton}
                    </Link>
                </div>

                <div className="pt-2">
                    <div className="text-xs text-slate-400 leading-relaxed">
                        <div className="font-semibold text-slate-300">{copy.litTitle}</div>
                        <div className="mt-1">
                            Forster, K., Keil, L., Wagner, V., Müller, M. A., Sellhorn, T., Feuerriegel, S. (2025).{" "}
                            <em>
                                {" "}
                                Assessing corporate sustainability with large language models: Evidence from Europe
                            </em>{" "}
                            (Working Paper No. 202; revised September 2025). TRR 266 Accounting for Transparency.
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
