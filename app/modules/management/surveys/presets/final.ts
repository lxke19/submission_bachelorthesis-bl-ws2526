// app/modules/management/surveys/presets/final.ts

import type {SurveyTemplatePayload} from "../types";
import {likert7, singleChoice, templateBase, textQuestion} from "./builders";

export function createFinalTemplatePreset(): SurveyTemplatePayload {
    const key: SurveyTemplatePayload["key"] = "final";

    return templateBase(key, "Final Survey (Overall)", "", [
        // Trust in a specific technology — Reliability
        likert7(
            `${key}_likert_trust_rel_01`,
            "The assistant performed reliably during the study. (1 = Strongly disagree, 7 = Strongly agree)",
            10,
        ),
        likert7(
            `${key}_likert_trust_rel_02`,
            "The assistant operated consistently in the way I expected. (1 = Strongly disagree, 7 = Strongly agree)",
            20,
        ),
        likert7(
            `${key}_likert_trust_rel_03`,
            "Overall, I could depend on the assistant to function properly. (1 = Strongly disagree, 7 = Strongly agree)",
            30,
        ),

        // Functionality
        likert7(
            `${key}_likert_trust_fun_01`,
            "The assistant had the capabilities needed to complete the tasks. (1 = Strongly disagree, 7 = Strongly agree)",
            40,
        ),
        likert7(
            `${key}_likert_trust_fun_02`,
            "The assistant provided the kinds of analytical support required by the tasks. (1 = Strongly disagree, 7 = Strongly agree)",
            50,
        ),
        likert7(
            `${key}_likert_trust_fun_03`,
            "The assistant’s features were sufficient for what I needed to do. (1 = Strongly disagree, 7 = Strongly agree)",
            60,
        ),

        singleChoice(
            `${key}_sc_attention_01`,
            "Attention check: Please select Option 2.",
            70,
            [
                {value: "opt1", label: "Option 1", order: 1},
                {value: "opt2", label: "Option 2", order: 2},
                {value: "opt3", label: "Option 3", order: 3},
                {value: "opt4", label: "Option 4", order: 4},
            ],
        ),

        // Helpfulness
        likert7(
            `${key}_likert_trust_help_01`,
            "The assistant was helpful in guiding me through the tasks. (1 = Strongly disagree, 7 = Strongly agree)",
            80,
        ),
        likert7(
            `${key}_likert_trust_help_02`,
            "When I needed help, the assistant provided useful support. (1 = Strongly disagree, 7 = Strongly agree)",
            90,
        ),
        likert7(
            `${key}_likert_trust_help_03`,
            "The assistant’s responses were helpful for reaching my conclusions. (1 = Strongly disagree, 7 = Strongly agree)",
            100,
        ),

        // Reliance calibration & perceived risk
        likert7(
            `${key}_likert_calibration_01`,
            "I could tell when I should be cautious about using the assistant’s answers. (1 = Strongly disagree, 7 = Strongly agree)",
            110,
        ),
        likert7(
            `${key}_likert_overreliance_01`,
            "At least once during the study, I relied on the assistant more than I should have. (1 = Strongly disagree, 7 = Strongly agree)",
            120,
        ),
        likert7(
            `${key}_likert_verification_01`,
            "When I was uncertain, I checked the data indicators before finalizing my answer. (1 = Strongly disagree, 7 = Strongly agree)",
            130,
        ),

        // Overall confidence (now also Likert 1-7)
        likert7(
            `${key}_likert_overall_confidence_01`,
            "Overall, how confident are you in the answers you provided in this study? (1 = Not confident at all, 7 = Very confident)",
            140,
        ),

        // Data indicators (variant-agnostic wording)
        likert7(
            `${key}_likert_indicators_useful_01`,
            "The data indicators helped me make better judgments. (1 = Strongly disagree, 7 = Strongly agree)",
            150,
        ),
        likert7(
            `${key}_likert_indicators_clear_01`,
            "The data indicators were easy to understand. (1 = Strongly disagree, 7 = Strongly agree)",
            160,
        ),
        likert7(
            `${key}_likert_indicators_overload_01`,
            "The data indicators felt overwhelming. (1 = Strongly disagree, 7 = Strongly agree)",
            170,
        ),

        // Required open-ended feedback ("/" allowed)
        textQuestion(
            `${key}_text_trust_drivers_01`,
            "What influenced your trust in the assistant the most? (If not applicable, please enter “/”.)",
            180,
        ),
        textQuestion(
            `${key}_text_reliance_reflection_01`,
            "Do you think you relied on the assistant appropriately overall? Please explain. (If not applicable, please enter “/”.)",
            190,
        ),
        textQuestion(
            `${key}_text_ui_feedback_01`,
            "What did you like or dislike about the interface (chat and data indicators)? (If not applicable, please enter “/”.)",
            200,
        ),
    ]);
}
