// app/modules/management/surveys/presets/task3_post.ts

import type {SurveyTemplatePayload} from "../types";
import {likert7, singleChoice, templateBase, textQuestion} from "./builders";
import type {SurveyQuestionPayload} from "../types";

export function createTask3PostTemplatePreset(): SurveyTemplatePayload {
    const key: SurveyTemplatePayload["key"] = "task3_post";

    const optionalJustification: SurveyQuestionPayload = {
        key: `${key}_text_03_justification`,
        text: "Optional: Briefly explain your conclusion for Task 3 and any concerns you considered. (If not applicable, please enter “/”.)",
        type: "TEXT",
        required: false,
        order: 80,
    };

    return templateBase(key, "Post Survey — Task 3", "", [
        singleChoice(
            `${key}_sc_01_indicator_pick`,
            "Which indicator did you use for BMW’s Scope 1 direct emissions?",
            10,
            [
                {
                    value: "gross_scope1_own_ops",
                    label: "Gross Scope 1 greenhouse gas emissions (Specification: Own operations)",
                    order: 1,
                },
                {value: "company_ghg_emissions", label: "Company greenhouse emissions", order: 2},
                {value: "scope1_emissions", label: "Scope 1 Emissions", order: 3},
            ],
        ),

        singleChoice(
            `${key}_sc_02_values_2017_2019`,
            "Were you able to retrieve values (including unit) for BMW for 2017, 2018, and 2019?",
            20,
            [
                {value: "all_three", label: "Yes, I retrieved values for all three years", order: 1},
                {value: "some_missing", label: "I retrieved some values, but at least one year was missing", order: 2},
                {value: "none", label: "No, I could not retrieve the values", order: 3},
                {value: "unsure", label: "I am not sure", order: 4},
            ],
        ),

        singleChoice(
            `${key}_sc_03_max_2010_2019_claim`,
            "Which statement best describes what you concluded for the period 2010-2019?",
            30,
            [
                {
                    value: "certain",
                    label: "I identified the year with the maximum value for 2010-2019 with high certainty",
                    order: 1
                },
                {
                    value: "unsure_absolute",
                    label: "I identified a maximum year/value, but I am not sure whether it is the absolute maximum for 2010-2019",
                    order: 2,
                },
                {
                    value: "could_not_determine",
                    label: "I could not determine the maximum year/value for 2010-2019",
                    order: 3
                },
                {value: "unsure", label: "I am not sure", order: 4},
            ],
        ),

        // required (as requested)
        textQuestion(
            `${key}_text_01_max_reason`,
            "If you were not fully certain about the maximum (or could not determine it), briefly explain why. (If not applicable, please enter “/”.)",
            40,
        ),

        likert7(
            `${key}_likert_01_assistant_useful`,
            "The assistant was useful for completing Task 3. (1 = Strongly disagree, 7 = Strongly agree)",
            50,
        ),

        likert7(
            `${key}_likert_02_reliance`,
            "For Task 3, I relied mainly on the assistant’s output. (1 = Strongly disagree, 7 = Strongly agree)",
            60,
        ),

        likert7(
            `${key}_likert_03_confidence`,
            "How confident are you in your conclusion for Task 3? (1 = Not confident at all, 7 = Very confident)",
            70,
        ),

        optionalJustification,
    ]);
}
