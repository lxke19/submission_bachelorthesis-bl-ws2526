// app/modules/management/surveys/defaults.ts
//
// Purpose:
// - Default wizard content so you can click through immediately.
// - Includes per template:
//   - 2x SINGLE_CHOICE
//   - 2x MULTI_CHOICE
//   - 2x SCALE_NRS (one Likert 1..7, one NRS 1..10)
// - Tasks are exactly 3 with strong prompt markdown.
// - You can edit everything in the wizard before submit.

import type {CreateStudyPayload, SurveyTemplatePayload, TaskDefinitionPayload} from "./types";
import {getSurveyTemplatePreset} from "./presets";
import {getTaskPreset} from "./task_presets";

function defaultLikertQuestion(key: string, text: string, order: number) {
    return {
        key,
        text,
        type: "SCALE_NRS" as const,
        required: true,
        order,
        scaleMin: 1,
        scaleMax: 7,
        scaleStep: 1,
    };
}

function defaultNrsQuestion(key: string, text: string, order: number) {
    return {
        key,
        text,
        type: "SCALE_NRS" as const,
        required: true,
        order,
        scaleMin: 1,
        scaleMax: 10,
        scaleStep: 1,
    };
}

function defaultSingleChoice(key: string, text: string, order: number) {
    return {
        key,
        text,
        type: "SINGLE_CHOICE" as const,
        required: true,
        order,
        options: [
            {value: "A", label: "Option A", order: 1},
            {value: "B", label: "Option B", order: 2},
            {value: "C", label: "Option C", order: 3},
        ],
    };
}

function defaultMultiChoice(key: string, text: string, order: number) {
    return {
        key,
        text,
        type: "MULTI_CHOICE" as const,
        required: true,
        order,
        options: [
            {value: "1", label: "Choice 1", order: 1},
            {value: "2", label: "Choice 2", order: 2},
            {value: "3", label: "Choice 3", order: 3},
        ],
    };
}

function buildTemplate(key: SurveyTemplatePayload["key"], name: string): SurveyTemplatePayload {
    return {
        key,
        name,
        description: "",
        questions: [
            defaultSingleChoice(`${key}_sc_01`, "Single choice: which statement fits best?", 10),
            defaultSingleChoice(`${key}_sc_02`, "Single choice: pick the most plausible option.", 20),

            defaultMultiChoice(`${key}_mc_01`, "Multi choice: select all that apply.", 30),
            defaultMultiChoice(`${key}_mc_02`, "Multi choice: which factors influenced you?", 40),

            // Scale rules requested:
            // - One Likert
            // - One 1..10 scale
            defaultLikertQuestion(`${key}_likert_01`, "Likert (1-7): I trust the assistant’s answer.", 50),
            defaultNrsQuestion(`${key}_nrs_01`, "NRS (1-10): How confident are you in your answer?", 60),
        ],
    };
}

/**
 * Build templates via presets (preferred) while keeping the old builder available.
 *
 * Why:
 * - You requested dedicated preset files per template key (pre/task1_post/task2_post/task3_post/final),
 *   so you can edit questions in simple, isolated files.
 * - We keep buildTemplate() and the old functions intact (nothing removed),
 *   but the wizard defaults now load from ./presets.
 */
function buildTemplateFromPresetOrFallback(key: SurveyTemplatePayload["key"], fallbackName: string): SurveyTemplatePayload {
    try {
        const preset = getSurveyTemplatePreset(key);

        // If a preset returns an empty/invalid object for any reason, we keep a safe fallback.
        if (!preset || !preset.key || !preset.questions || preset.questions.length === 0) {
            return buildTemplate(key, fallbackName);
        }

        return preset;
    } catch {
        // Hard fallback: keep old behavior.
        return buildTemplate(key, fallbackName);
    }
}

/**
 * Build tasks via presets (preferred) while keeping the old inline task definitions available as fallback.
 *
 * Why:
 * - You requested task prompts to be as easily editable as survey templates (isolated files).
 * - We keep the original defaults inline (nothing removed),
 *   but the wizard defaults now load prompts from ./task_presets.
 */
function buildTaskFromPresetOrFallback(
    taskNumber: TaskDefinitionPayload["taskNumber"],
    fallback: TaskDefinitionPayload,
): TaskDefinitionPayload {
    try {
        const preset = getTaskPreset(taskNumber);

        // If a preset returns an empty/invalid object for any reason, we keep a safe fallback.
        if (!preset || !preset.taskNumber || !preset.title || !preset.promptMarkdown) {
            return fallback;
        }

        return preset;
    } catch {
        // Hard fallback: keep old behavior.
        return fallback;
    }
}

export function createDefaultStudyWizardState(): CreateStudyPayload {
    return {
        study: {
            key: "ws2526-main",
            name: "Bachelor Thesis Study",
            description: "Default study configuration created via wizard (edit before submit).",
        },

        tasks: [
            buildTaskFromPresetOrFallback(1, {
                taskNumber: 1,
                title: "Demand planning around Christmas",
                promptMarkdown: `# Task 1 — Demand Planning (Holiday Peak)

You are an analyst in **Sales & Operations Planning**.

## Goal
Use the assistant to decide whether production or purchasing should be increased **after Christmas**.

## What you should do
- Ask the assistant to analyze historic patterns and seasonal demand signals.
- If the assistant uses database sources, pay attention to **time coverage** (data year vs question year).

## Final output (your answer)
- Choose **one** recommendation:
  1. Increase production
  2. Keep production stable
  3. Reduce production
- Provide a short justification (1-3 sentences).`,
                metadata: {
                    domain: "S&OP",
                    expectedSignal: "seasonality",
                },
            }),
            buildTaskFromPresetOrFallback(2, {
                taskNumber: 2,
                title: "Revenue vs expenses (2023)",
                promptMarkdown: `# Task 2 — Finance Snapshot (2023)

You are asked to compare **revenue** vs **expenses** in 2023.

## Goal
Determine whether the business operated at a surplus or deficit in 2023.

## What you should do
- Ask the assistant for totals and a clear comparison.
- If multiple sources exist, ask it to reconcile them.

## Final output (your answer)
- Pick one:
  - Surplus
  - Deficit
- Provide the approximate difference (if possible).`,
                metadata: {
                    domain: "finance",
                    year: 2023,
                },
            }),
            buildTaskFromPresetOrFallback(3, {
                taskNumber: 3,
                title: "Inventory risk and stockout prevention",
                promptMarkdown: `# Task 3 — Inventory Risk

Assume you manage inventory for a product category.

## Goal
Decide whether there is a **stockout risk** in the next period and what action to take.

## What you should do
- Ask the assistant to reason about sales velocity vs inventory levels.
- Check whether the data timeframe matches the asked timeframe.

## Final output (your answer)
- Pick one action:
  1. Increase reorder quantity
  2. Keep reorder quantity stable
  3. Reduce reorder quantity`,
                metadata: {
                    domain: "inventory",
                    risk: "stockout",
                },
            }),
        ],

        templates: [
            buildTemplateFromPresetOrFallback("pre", "Pre Survey (Baseline)"),
            buildTemplateFromPresetOrFallback("task1_post", "Post Survey — Task 1"),
            buildTemplateFromPresetOrFallback("task2_post", "Post Survey — Task 2"),
            buildTemplateFromPresetOrFallback("task3_post", "Post Survey — Task 3"),
            buildTemplateFromPresetOrFallback("final", "Final Survey (Overall)"),
        ],
    };
}
