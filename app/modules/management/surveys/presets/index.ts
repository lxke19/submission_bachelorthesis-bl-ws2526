// app/modules/management/surveys/presets/index.ts
//
// Purpose:
// - Central registry for the 5 survey template presets.
// - Keeps defaults.ts clean while allowing easy per-template editing.
// - Each preset is isolated in its own file for simple maintenance.

import type {SurveyTemplatePayload} from "../types";

import {createPreTemplatePreset} from "./pre";
import {createTask1PostTemplatePreset} from "./task1_post";
import {createTask2PostTemplatePreset} from "./task2_post";
import {createTask3PostTemplatePreset} from "./task3_post";
import {createFinalTemplatePreset} from "./final";

const PRESET_FACTORIES: Record<SurveyTemplatePayload["key"], () => SurveyTemplatePayload> = {
    pre: createPreTemplatePreset,
    task1_post: createTask1PostTemplatePreset,
    task2_post: createTask2PostTemplatePreset,
    task3_post: createTask3PostTemplatePreset,
    final: createFinalTemplatePreset,
};

/**
 * Get the preset for a given fixed template key.
 *
 * Notes:
 * - Keys are fixed by validation: pre/task1_post/task2_post/task3_post/final.
 * - This function throws if a key is missing (which should never happen),
 *   so defaults.ts can fallback safely if needed.
 */
export function getSurveyTemplatePreset(key: SurveyTemplatePayload["key"]): SurveyTemplatePayload {
    const fn = PRESET_FACTORIES[key];
    if (!fn) {
        throw new Error(`[surveys/presets] Missing preset factory for key: ${key}`);
    }
    return fn();
}
