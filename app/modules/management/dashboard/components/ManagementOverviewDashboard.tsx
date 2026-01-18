"use client";

// app/modules/management/dashboard/components/ManagementOverviewDashboard.tsx
//
// Purpose:
// - Main dashboard container for /management/dashboard.
// - Loads management dashboard metrics (all studies or one study).
// - Provides: searchable study picker + KPIs + tabs (General/Tasks/Surveys/Participants).
//
// Design goals:
// - Clear, extendable structure (new tabs/modules later).
// - Robust empty-state handling (no studies / no participants / no submissions).
// - Avoid heavy payloads: transcript/answers are loaded on demand.
//
// EXTENSION (Tasks tab):
// - More analytics-friendly task breakdown:
//   - Split each task into "Chat" and "Post-Survey" rows
//   - Show post-survey timing and submission rates
//   - Clarify "Avg Msg" as "User/Assistant"
//   - Add avg restarts for chat
//
// EXTENSION (General tab):
// - Make the overview more meaningful for analysis by adding a Survey Overview module:
//   - Two views: "All Surveys" (aggregated) and "One Survey" (single phase drilldown).
//   - Uses overview.study.surveySummaries if available (fallback to empty-state gracefully).
//   - Keeps General as a high-level dashboard but with data-understanding focus.
//
// PATCH (Selection UX)
// -------------------
// - Clicking a Study in GlobalModeView -> auto-select that study (drilldown).
// - Persist selected study across reload via URL query param `studyId`.
// - Source of truth: `studyId` query param (null => All Studies).
// - Start state: no query param => All Studies.
// - Reload: keeps current selection.
//
// Notes:
// - Uses nuqs (already used elsewhere in the repo) for stable query syncing.
// - We intentionally keep existing internal state (selectedStudyId/pendingStudyId) intact;
//   the query param just becomes the initializer + persistence layer.

import React, {useEffect, useState} from "react";
import StudyPicker from "./StudyPicker";
import ParticipantModal from "./ParticipantModal";
import AnswersModal from "./AnswersModal";
import TabButton, {type DashboardTabKey} from "./TabButton";
import GlobalModeView from "./GlobalModeView";
import GeneralTab from "./tabs/GeneralTab";
import TasksTab from "./tabs/TasksTab";
import SurveysTab from "./tabs/SurveysTab";
import ParticipantsTab from "./tabs/ParticipantsTab";
import {
    loadOverview,
    loadParticipantTranscript,
    loadStudyParticipants,
    loadSurveyAnalytics,
    loadSurveyQuestionAnswers,
    type ParticipantsListItem,
    type SurveyAnalyticsPhaseBlock,
    type SurveyQuestionAnswerRow,
} from "../api";
import type {OverviewResponse} from "../types";
import {useQueryState} from "nuqs";
import ExportsTab from "@/app/modules/management/dashboard/components/tabs/ExportsTab";

type GeneralSurveyView = "all" | "one";

export default function ManagementOverviewDashboard() {
    const [overview, setOverview] = useState<OverviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
    const [pendingStudyId, setPendingStudyId] = useState<string | null>(null);

    const [tab, setTab] = useState<DashboardTabKey>("general");

    // General tab: survey presentation mode
    const [generalSurveyView, setGeneralSurveyView] = useState<GeneralSurveyView>("all");
    const [generalSurveyPhase, setGeneralSurveyPhase] = useState<string>("PRE");

    // Study-only: participants and survey analytics are loaded on demand.
    const [participants, setParticipants] = useState<ParticipantsListItem[] | null>(null);
    const [participantsLoading, setParticipantsLoading] = useState(false);
    const [participantsError, setParticipantsError] = useState<string | null>(null);

    const [surveyAnalytics, setSurveyAnalytics] = useState<SurveyAnalyticsPhaseBlock[] | null>(null);
    const [surveyLoading, setSurveyLoading] = useState(false);
    const [surveyError, setSurveyError] = useState<string | null>(null);

    // Modal state: participant details + transcript
    const [activeParticipant, setActiveParticipant] = useState<ParticipantsListItem | null>(null);
    const [transcriptLoading, setTranscriptLoading] = useState(false);
    const [transcriptError, setTranscriptError] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<Awaited<ReturnType<typeof loadParticipantTranscript>> | null>(null);

    // Modal state: question answers popup
    const [answersModal, setAnswersModal] = useState<{
        studyId: string;
        phase: string;
        questionId: string;
        title: string;
        rows: SurveyQuestionAnswerRow[] | null;
        loading: boolean;
        error: string | null;
    } | null>(null);

    /**
     * Persisted study selection (URL)
     * ------------------------------
     * - `studyId=null` => All Studies
     * - `studyId=<id>` => One Study selected
     *
     * Why:
     * - Click-to-drilldown from global table
     * - Reload keeps selection
     * - Deep-linkable for debugging
     */
    const [studyIdParam, setStudyIdParam] = useQueryState("studyId");

    async function refresh(nextStudyId: string | null) {
        setLoading(true);
        setError(null);

        const res = await loadOverview(nextStudyId);

        setLoading(false);

        if (!res.ok) {
            setError(res.error);
            setOverview(res);
            return;
        }

        setOverview(res);
        setSelectedStudyId(res.selection.studyId);
        setPendingStudyId(res.selection.studyId);

        // Reset on selection change
        setParticipants(null);
        setParticipantsError(null);
        setSurveyAnalytics(null);
        setSurveyError(null);

        // Reset tabs + general survey module state to deterministic defaults
        setTab("general");
        setGeneralSurveyView("all");
        setGeneralSurveyPhase("PRE");
    }

    useEffect(() => {
        // Initial load respects query param.
        // - If absent => All Studies
        // - If present => select that study on first load
        refresh(studyIdParam ?? null).catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const activeStudyId =
        overview?.ok && overview.mode === "study"
            ? overview.selection.studyId
            : null;

    async function ensureParticipantsLoaded() {
        if (!activeStudyId) return;
        if (participants || participantsLoading) return;

        setParticipantsLoading(true);
        setParticipantsError(null);

        const res = await loadStudyParticipants(activeStudyId);

        setParticipantsLoading(false);

        if (!res.ok) {
            setParticipantsError(res.error);
            return;
        }

        setParticipants(res.participants);
    }

    async function ensureSurveyAnalyticsLoaded() {
        if (!activeStudyId) return;
        if (surveyAnalytics || surveyLoading) return;

        setSurveyLoading(true);
        setSurveyError(null);

        const res = await loadSurveyAnalytics(activeStudyId);

        setSurveyLoading(false);

        if (!res.ok) {
            setSurveyError(res.error);
            return;
        }

        setSurveyAnalytics(res.phases);
    }

    async function openParticipant(p: ParticipantsListItem) {
        setActiveParticipant(p);
        setTranscript(null);
        setTranscriptLoading(true);
        setTranscriptError(null);

        const res = await loadParticipantTranscript(p.id);

        setTranscriptLoading(false);

        if (!res.ok) {
            setTranscriptError(res.error);
            return;
        }

        setTranscript(res);
    }

    async function openAnswers(args: { studyId: string; phase: string; questionId: string; title: string }) {
        setAnswersModal({
            ...args,
            rows: null,
            loading: true,
            error: null,
        });

        const res = await loadSurveyQuestionAnswers({
            studyId: args.studyId,
            phase: args.phase,
            questionId: args.questionId,
        });

        if (!res.ok) {
            setAnswersModal((prev) =>
                prev
                    ? {
                        ...prev,
                        loading: false,
                        error: res.error,
                    }
                    : null,
            );
            return;
        }

        setAnswersModal((prev) =>
            prev
                ? {
                    ...prev,
                    loading: false,
                    rows: res.rows,
                }
                : null,
        );
    }

    // Tabs: lazy load
    useEffect(() => {
        if (!activeStudyId) return;
        if (tab === "participants") ensureParticipantsLoaded().catch(() => undefined);
        if (tab === "surveys") ensureSurveyAnalyticsLoaded().catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, activeStudyId]);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-200">Dashboard</div>
                        <div className="text-xs text-slate-400">
                            Auswahl: <span className="text-slate-200">{selectedStudyId ? "Study" : "All Studies"}</span>
                        </div>
                    </div>

                    {overview && overview.ok ? (
                        <StudyPicker
                            studies={overview.studies}
                            value={selectedStudyId}
                            pendingValue={pendingStudyId}
                            onChangePendingAction={setPendingStudyId}
                            onApplyAction={() => {
                                // Persist selection in URL, then refresh.
                                // Note: nuqs setters can return a Promise; we intentionally fire-and-forget here.
                                // Using `void` is the idiomatic way to silence "Promise returned is ignored".
                                void setStudyIdParam(pendingStudyId);
                                refresh(pendingStudyId).catch(() => undefined);
                            }}
                            disabled={loading}
                        />
                    ) : (
                        <div className="text-sm text-slate-400">Lade Studien...</div>
                    )}
                </div>

                {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
            </div>

            {loading ? <div className="text-sm text-slate-400">Lade Overview...</div> : null}

            {overview && overview.ok && overview.mode === "all" ? (
                <GlobalModeView
                    overview={overview}
                    onSelectStudyAction={(studyId) => {
                        // Click-to-drilldown:
                        // - Update URL param (persist across reload)
                        // - Refresh dashboard for that study
                        setPendingStudyId(studyId);
                        void setStudyIdParam(studyId);
                        refresh(studyId).catch(() => undefined);
                    }}
                />
            ) : null}

            {overview && overview.ok && overview.mode === "study" ? (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-rose-900/30 bg-black/20 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold text-slate-200">
                                    Study: {overview.study.kpis.name}{" "}
                                    <span className="text-xs text-slate-400">({overview.study.kpis.key})</span>
                                </div>
                                <div className="text-xs text-slate-400">
                                    Participants:{" "}
                                    <span className="text-slate-200">{overview.study.kpis.participantsTotal}</span> •
                                    Completed:{" "}
                                    <span
                                        className="text-slate-200">{overview.study.kpis.participantsCompleted}</span>{" "}
                                    (<span className="text-slate-200">
                                        {Math.round((overview.study.kpis.completionRate ?? 0) * 100)}%
                                    </span>)
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <TabButton id="general" label="General" active={tab === "general"}
                                           onClickAction={setTab}/>
                                <TabButton id="tasks" label="Tasks" active={tab === "tasks"} onClickAction={setTab}/>
                                <TabButton id="surveys" label="Surveys" active={tab === "surveys"}
                                           onClickAction={setTab}/>
                                <TabButton id="participants" label="Participants" active={tab === "participants"}
                                           onClickAction={setTab}/>
                                <TabButton id="exports" label="Exports" active={tab === "exports"}
                                           onClickAction={setTab}/>
                            </div>
                        </div>
                    </div>

                    {tab === "general" ? (
                        <GeneralTab
                            overview={overview}
                            generalSurveyView={generalSurveyView}
                            generalSurveyPhase={generalSurveyPhase}
                            onChangeGeneralSurveyViewAction={setGeneralSurveyView}
                            onChangeGeneralSurveyPhaseAction={setGeneralSurveyPhase}
                        />
                    ) : null}

                    {tab === "tasks" ? <TasksTab overview={overview}/> : null}

                    {tab === "surveys" ? (
                        <SurveysTab
                            activeStudyId={activeStudyId}
                            surveyAnalytics={surveyAnalytics}
                            surveyLoading={surveyLoading}
                            surveyError={surveyError}
                            onOpenAnswersAction={(args) => {
                                openAnswers(args).catch(() => undefined);
                            }}
                        />
                    ) : null}

                    {tab === "participants" ? (
                        <ParticipantsTab
                            participants={participants}
                            participantsLoading={participantsLoading}
                            participantsError={participantsError}
                            onOpenParticipantAction={(p) => {
                                openParticipant(p).catch(() => undefined);
                            }}
                        />
                    ) : null}

                    {tab === "exports" ? (
                        <ExportsTab studyId={activeStudyId!} studyKey={overview.study.kpis.key}/>
                    ) : null}
                </div>
            ) : null}

            {activeParticipant ? (
                <ParticipantModal
                    participant={activeParticipant}
                    transcriptLoading={transcriptLoading}
                    transcriptError={transcriptError}
                    transcript={transcript}
                    onCloseAction={() => {
                        setActiveParticipant(null);
                        setTranscript(null);
                        setTranscriptError(null);
                    }}
                />
            ) : null}

            {answersModal ? (
                <AnswersModal
                    title={answersModal.title}
                    loading={answersModal.loading}
                    error={answersModal.error}
                    rows={answersModal.rows}
                    onCloseAction={() => setAnswersModal(null)}
                />
            ) : null}
        </div>
    );
}
