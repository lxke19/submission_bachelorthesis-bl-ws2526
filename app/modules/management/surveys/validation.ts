// app/modules/management/surveys/validation.ts
//
// Purpose:
// - Single source of truth for validation (client + server).
// - Ensures analytics-friendly structure:
//   - fixed templates
//   - exactly 3 tasks
//   - stable keys / orders
//   - scale constraints
//   - choice questions require >= 2 options
//
// Why zod here:
// - You can reuse it in the wizard before POSTing,
//   and on the server to reject invalid payloads.

import {z} from "zod";

const Key = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-_]*$/i, "Use letters, digits, '-' or '_'");

const NonEmptyText = z.string().trim().min(1).max(5000);

export const SurveyOptionPayloadSchema = z.object({
    value: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(200),
    order: z.number().int().min(0).max(10_000),
});

export const SurveyQuestionPayloadSchema = z
    .object({
        key: Key,
        text: NonEmptyText,
        type: z.enum(["SINGLE_CHOICE", "MULTI_CHOICE", "SCALE_NRS", "TEXT"]),
        required: z.boolean(),
        order: z.number().int().min(0).max(10_000),

        scaleMin: z.number().int().optional(),
        scaleMax: z.number().int().optional(),
        scaleStep: z.number().int().optional(),

        options: z.array(SurveyOptionPayloadSchema).optional(),
    })
    .superRefine((q, ctx) => {
        if (q.type === "SCALE_NRS") {
            if (q.scaleMin == null || q.scaleMax == null || q.scaleStep == null) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "SCALE_NRS requires scaleMin/scaleMax/scaleStep",
                });
            } else {
                if (q.scaleMin >= q.scaleMax) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "scaleMin must be < scaleMax",
                    });
                }
                if (q.scaleStep <= 0) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "scaleStep must be > 0",
                    });
                }
            }
        }

        if (q.type === "SINGLE_CHOICE" || q.type === "MULTI_CHOICE") {
            const opts = q.options ?? [];
            if (opts.length < 2) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `${q.type} requires at least 2 options`,
                });
            }
            // Ensure unique option values within the question (export-friendly).
            const values = opts.map((o) => o.value);
            if (new Set(values).size !== values.length) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Option values must be unique within a question",
                });
            }
        }
    });

export const SurveyTemplatePayloadSchema = z.object({
    key: z.enum(["pre", "task1_post", "task2_post", "task3_post", "final"]),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    questions: z.array(SurveyQuestionPayloadSchema).min(1),
});

export const TaskDefinitionPayloadSchema = z.object({
    taskNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    title: z.string().trim().min(1).max(200),
    promptMarkdown: z.string().trim().min(1).max(20_000),
    metadata: z.unknown().optional(),
});

export const StudyBasicsPayloadSchema = z.object({
    key: Key,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
});

export const CreateStudyPayloadSchema = z
    .object({
        study: StudyBasicsPayloadSchema,
        tasks: z.array(TaskDefinitionPayloadSchema),
        templates: z.array(SurveyTemplatePayloadSchema),
    })
    .superRefine((p, ctx) => {
        // Exactly 3 tasks with numbers 1..3.
        const nums = p.tasks.map((t) => t.taskNumber).sort();
        const expected = [1, 2, 3];
        if (nums.length !== 3 || nums.join(",") !== expected.join(",")) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "You must provide exactly 3 tasks with taskNumber 1, 2, 3",
            });
        }

        // Templates: must include all 5 keys exactly once.
        const keys = p.templates.map((t) => t.key);
        const required = ["pre", "task1_post", "task2_post", "task3_post", "final"];
        for (const k of required) {
            if (!keys.includes(k as any)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Missing required template: ${k}`,
                });
            }
        }
        if (new Set(keys).size !== keys.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Template keys must be unique",
            });
        }

        // Within each template: question keys unique.
        for (const tpl of p.templates) {
            const qKeys = tpl.questions.map((q) => q.key);
            if (new Set(qKeys).size !== qKeys.length) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate question key in template ${tpl.key}`,
                });
            }
        }
    });
