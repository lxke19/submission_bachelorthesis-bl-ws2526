// app/modules/management/surveys/presets/task1_post.ts

import type {SurveyQuestionPayload, SurveyTemplatePayload} from "../types";
import {likert7, singleChoice, templateBase} from "./builders";

export function createTask1PostTemplatePreset(): SurveyTemplatePayload {
    const key: SurveyTemplatePayload["key"] = "task1_post";

    const optionalNotes: SurveyQuestionPayload = {
        key: `${key}_text_01_notes`,
        text: "Optional: If anything was confusing or surprising in Task 1, please describe it briefly. (If not applicable, please enter “/”.)",
        type: "TEXT",
        required: false,
        order: 60,
    };

    return templateBase(key, "Post Survey — Task 1", "", [
        singleChoice(
            `${key}_sc_01_de_companies`,
            "How many distinct companies from Germany are included in the dataset?",
            10,
            [
                {value: "63", label: "63", order: 1},
                {value: "68", label: "68", order: 2},
                {value: "71", label: "71", order: 3},
                {value: "0", label: "0", order: 4},
            ],
        ),

        singleChoice(
            `${key}_sc_02_siemens_2017_record`,
            "Is Siemens included in the dataset, and do we have a record for Siemens in 2017?",
            20,
            [
                {value: "included_2017_yes", label: "Siemens is included, and a 2017 record is available", order: 1},
                {value: "included_2017_no", label: "Siemens is included, but a 2017 record is not available", order: 2},
                {value: "not_included", label: "Siemens is not included in the dataset", order: 3},
            ],
        ),

        singleChoice(
            `${key}_sc_03_female_headcount_availability`,
            "For Siemens in 2017, was the value for “Number of employees (head count), at end of period — Specification: Female” available?",
            30,
            [
                {value: "available_yes", label: "Yes, a value was available", order: 1},
                {value: "available_no", label: "No, the value was missing / not reported", order: 2},
                {value: "unsure", label: "I am not sure", order: 3},
            ],
        ),

        likert7(
            `${key}_likert_01_reliance`,
            "For Task 1, I relied mainly on the assistant’s output. (1 = Strongly disagree, 7 = Strongly agree)",
            40,
        ),

        likert7(
            `${key}_likert_02_confidence`,
            "How confident are you in your answers for Task 1? (1 = Not confident at all, 7 = Very confident)",
            50,
        ),

        optionalNotes,
    ]);
}
