// app/modules/management/surveys/presets/pre.ts

import type {SurveyTemplatePayload} from "../types";
import {likert7, multiChoice, singleChoice, templateBase} from "./builders";

export function createPreTemplatePreset(): SurveyTemplatePayload {
    const key: SurveyTemplatePayload["key"] = "pre";

    return templateBase(key, "Pre Survey (Baseline)", "", [
        singleChoice(`${key}_sc_01_age_group`, "What is your age group?", 10, [
            {value: "18_24", label: "18-24", order: 1},
            {value: "25_34", label: "25-34", order: 2},
            {value: "35_44", label: "35-44", order: 3},
            {value: "45_54", label: "45-54", order: 4},
            {value: "55_plus", label: "55+", order: 5},
        ]),

        singleChoice(`${key}_sc_02_gender`, "What is your gender?", 20, [
            {value: "female", label: "Female", order: 1},
            {value: "male", label: "Male", order: 2},
            {value: "non_binary", label: "Non-binary", order: 3},
            {value: "prefer_not_say", label: "Prefer not to say", order: 4},
        ]),

        singleChoice(
            `${key}_sc_03_education`,
            "What is your highest completed education level?",
            30,
            [
                {value: "high_school", label: "High school", order: 1},
                {value: "bachelor", label: "Bachelor’s degree", order: 2},
                {value: "master", label: "Master’s degree", order: 3},
                {value: "doctorate", label: "Doctorate", order: 4},
                {value: "other", label: "Other", order: 5},
            ],
        ),

        multiChoice(
            `${key}_mc_01_background`,
            "Which areas do you have experience in? (Select all that apply)",
            40,
            [
                {value: "data_analysis", label: "Data analysis", order: 1},
                {value: "sql_databases", label: "SQL or databases", order: 2},
                {value: "business_analytics", label: "Business analytics", order: 3},
                {value: "esg_sustainability", label: "Sustainability / ESG topics", order: 4},
                {value: "finance_controlling", label: "Finance / controlling", order: 5},
                {value: "none", label: "None of these", order: 6},
            ],
        ),

        singleChoice(
            `${key}_sc_attention_01`,
            "Attention check: Please select Option 3.",
            50,
            [
                {value: "opt1", label: "Option 1", order: 1},
                {value: "opt2", label: "Option 2", order: 2},
                {value: "opt3", label: "Option 3", order: 3},
                {value: "opt4", label: "Option 4", order: 4},
            ],
        ),

        likert7(
            `${key}_likert_01_ai_frequency`,
            "How often do you use AI tools (e.g., ChatGPT) in your daily life or work? (1 = Never, 7 = Very often)",
            60,
        ),

        likert7(
            `${key}_likert_02_ai_confidence`,
            "I feel confident using AI-supported tools for analytical tasks. (1 = Strongly disagree, 7 = Strongly agree)",
            70,
        ),
    ]);
}
