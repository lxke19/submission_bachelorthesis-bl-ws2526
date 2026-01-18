// app/modules/management/surveys/presets/builders.ts
//
// Purpose:
// - Small helper builders to keep preset files short and easy to edit.
// - Mirrors the question shapes used by the wizard/types.
// - Encourages stable keys and stable order spacing (10, 20, 30, ...).

import type {SurveyQuestionPayload, SurveyTemplatePayload} from "../types";

export function likert7(key: string, text: string, order: number): SurveyQuestionPayload {
    return {
        key,
        text,
        type: "SCALE_NRS",
        required: true,
        order,
        scaleMin: 1,
        scaleMax: 7,
        scaleStep: 1,
    };
}

export function nrs10(key: string, text: string, order: number): SurveyQuestionPayload {
    return {
        key,
        text,
        type: "SCALE_NRS",
        required: true,
        order,
        scaleMin: 1,
        scaleMax: 10,
        scaleStep: 1,
    };
}

export function singleChoice(
    key: string,
    text: string,
    order: number,
    options: Array<{ value: string; label: string; order: number }> = [
        {value: "A", label: "Option A", order: 1},
        {value: "B", label: "Option B", order: 2},
        {value: "C", label: "Option C", order: 3},
    ],
): SurveyQuestionPayload {
    return {
        key,
        text,
        type: "SINGLE_CHOICE",
        required: true,
        order,
        options,
    };
}

export function multiChoice(
    key: string,
    text: string,
    order: number,
    options: Array<{ value: string; label: string; order: number }> = [
        {value: "1", label: "Choice 1", order: 1},
        {value: "2", label: "Choice 2", order: 2},
        {value: "3", label: "Choice 3", order: 3},
    ],
): SurveyQuestionPayload {
    return {
        key,
        text,
        type: "MULTI_CHOICE",
        required: true,
        order,
        options,
    };
}

export function textQuestion(key: string, text: string, order: number): SurveyQuestionPayload {
    return {
        key,
        text,
        type: "TEXT",
        required: true,
        order,
    };
}

/**
 * Minimal template factory to keep presets consistent.
 * - Ensures the returned shape always matches SurveyTemplatePayload.
 */
export function templateBase(
    key: SurveyTemplatePayload["key"],
    name: string,
    description = "",
    questions: SurveyQuestionPayload[],
): SurveyTemplatePayload {
    return {key, name, description, questions};
}
