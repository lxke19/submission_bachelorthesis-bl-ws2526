// app/modules/management/surveys/presets/task2_post.ts

import type {SurveyQuestionPayload, SurveyTemplatePayload} from "../types";
import {likert7, singleChoice, templateBase, textQuestion} from "./builders";

export function createTask2PostTemplatePreset(): SurveyTemplatePayload {
    const key: SurveyTemplatePayload["key"] = "task2_post";

    const optionalJustification: SurveyQuestionPayload = {
        key: `${key}_text_02_justification`,
        text: "Optional: Briefly explain your conclusion for Task 2 (trend direction and any concerns you considered). (If not applicable, please enter “/”.)",
        type: "TEXT",
        required: false,
        order: 90,
    };

    return templateBase(key, "Post Survey — Task 2", "", [
        singleChoice(
            `${key}_sc_01_bmw_2017_value`,
            "What was BMW’s 2017 value for “Board’s gender diversity ratio”?",
            10,
            [
                {value: "12_5pct", label: "12.5%", order: 1},
                {value: "7pct", label: "7%", order: 2},
                {value: "35pct", label: "35%", order: 3},
                {value: "unsure", label: "I am not sure", order: 4},
            ],
        ),

        singleChoice(
            `${key}_sc_02_high_low_claim`,
            "Which statement best describes what you concluded for the period 2017-2024?",
            20,
            [
                {
                    value: "certain",
                    label: "I found the highest and lowest values for the period 2017-2024 with high certainty",
                    order: 1
                },
                {
                    value: "some_but_unsure_absolute",
                    label: "I found a highest and a lowest value, but I am not sure whether they are the absolute highest/lowest for 2017-2024",
                    order: 2,
                },
                {
                    value: "could_not_determine",
                    label: "I could not determine a highest and lowest value for 2017-2024",
                    order: 3
                },
                {value: "unsure", label: "I am not sure", order: 4},
            ],
        ),

        // required (as requested)
        textQuestion(
            `${key}_text_01_high_low_reason`,
            "If you were not fully certain about the highest/lowest values (or could not determine them), briefly explain why. (If not applicable, please enter “/”.)",
            30,
        ),

        singleChoice(
            `${key}_sc_03_trend_direction`,
            "Based on the values you collected, what best describes the development from 2017 to 2024?",
            40,
            [
                {value: "increased", label: "Increased", order: 1},
                {value: "decreased", label: "Decreased", order: 2},
                {value: "no_clear_trend", label: "No clear trend", order: 3},
                {value: "unsure", label: "I am not sure", order: 4},
            ],
        ),

        likert7(
            `${key}_likert_01_assistant_useful`,
            "The assistant was useful for completing Task 2. (1 = Strongly disagree, 7 = Strongly agree)",
            50,
        ),

        singleChoice(
            `${key}_sc_04_comparability_issue`,
            "Which statement best describes your assessment of comparability across years?",
            60,
            [
                {
                    value: "format_issue_identified",
                    label: "I identified a comparability issue caused by inconsistent formatting/representation (e.g., 0.1 vs 10%)",
                    order: 1,
                },
                {
                    value: "suspected_not_pinned",
                    label: "I suspected a problem because the values did not seem plausible/consistent, but I could not pinpoint the cause",
                    order: 2,
                },
                {value: "no_issue", label: "I did not identify any comparability issue", order: 3},
                {value: "unsure", label: "I am not sure", order: 4},
            ],
        ),

        likert7(
            `${key}_likert_02_reliance`,
            "For Task 2, I relied mainly on the assistant’s output. (1 = Strongly disagree, 7 = Strongly agree)",
            70,
        ),

        likert7(
            `${key}_likert_03_confidence`,
            "How confident are you in your conclusion for Task 2? (1 = Not confident at all, 7 = Very confident)",
            80,
        ),

        optionalJustification,
    ]);
}
