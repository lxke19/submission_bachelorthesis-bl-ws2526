// app/modules/management/surveys/types.ts
//
// Purpose:
// - Shared payload types for the wizard and the API.
// - Keep this stable: these keys become your "analysis keys" later.

export type SurveyQuestionType =
    | "SINGLE_CHOICE"
    | "MULTI_CHOICE"
    | "SCALE_NRS"
    | "TEXT";

export type SurveyOptionPayload = {
    value: string; // machine value (export-friendly)
    label: string; // UI label
    order: number; // stable ordering
};

export type SurveyQuestionPayload = {
    key: string; // stable analysis key (unique within template)
    text: string;
    type: SurveyQuestionType;
    required: boolean;
    order: number;

    // SCALE_NRS only
    scaleMin?: number;
    scaleMax?: number;
    scaleStep?: number;

    // SINGLE/MULTI only
    options?: SurveyOptionPayload[];
};

export type SurveyTemplatePayload = {
    key: "pre" | "task1_post" | "task2_post" | "task3_post" | "final";
    name: string;
    description?: string;
    questions: SurveyQuestionPayload[];
};

export type TaskDefinitionPayload = {
    taskNumber: 1 | 2 | 3;
    title: string;
    promptMarkdown: string;
    metadata?: unknown; // Json in Prisma
};

export type StudyBasicsPayload = {
    key: string; // unique per Study
    name: string;
    description?: string;
};

export type CreateStudyPayload = {
    study: StudyBasicsPayload;
    tasks: TaskDefinitionPayload[];
    templates: SurveyTemplatePayload[];
};
