// app/modules/management/surveys/task_presets/index.ts
//
// Purpose:
// - Central registry for the 3 task prompt presets.
// - Keeps defaults.ts clean while allowing easy per-task editing.
// - Each task preset is isolated in its own file for simple maintenance.

import type {TaskDefinitionPayload} from "../types";

import {createTask1PromptPreset} from "./task1";
import {createTask2PromptPreset} from "./task2";
import {createTask3PromptPreset} from "./task3";

const PRESET_FACTORIES: Record<TaskDefinitionPayload["taskNumber"], () => TaskDefinitionPayload> = {
    1: createTask1PromptPreset,
    2: createTask2PromptPreset,
    3: createTask3PromptPreset,
};

/**
 * Get the preset for a given fixed task number.
 *
 * Notes:
 * - Task numbers are fixed by validation and the wizard flow: 1, 2, 3.
 * - This function throws if a taskNumber is missing (which should never happen),
 *   so defaults.ts can fallback safely if needed.
 */
export function getTaskPreset(taskNumber: TaskDefinitionPayload["taskNumber"]): TaskDefinitionPayload {
    const fn = PRESET_FACTORIES[taskNumber];
    if (!fn) {
        throw new Error(`[surveys/task_presets] Missing preset factory for taskNumber: ${taskNumber}`);
    }
    return fn();
}
