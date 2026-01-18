// app/api/management/surveys/route.ts
//
// Purpose:
// - GET: List Studies (= your "Survey configs") for the Management UI.
// - POST: Create a new Study with:
//   - 3 TaskDefinitions
//   - 5 SurveyTemplates (pre, task1_post, task2_post, task3_post, final)
//   - Questions + Options per template
//
// Auth:
// - Admin-only. Uses requireApiAuthUserId() from app/lib/auth.
//
// Notes:
// - Read-only after creation (no update/delete endpoints by design).
// - Validation is strict and analytics-friendly (stable keys, orders, fixed task numbers).

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireApiAuthUserId} from "@/app/lib/auth";
import {CreateStudyPayloadSchema} from "@/app/modules/management/surveys/validation";
import {Prisma} from "@/app/generated/prisma/client";

export async function GET() {
    try {
        await requireApiAuthUserId();

        const studies = await prisma.study.findMany({
            orderBy: {createdAt: "desc"},
            select: {
                id: true,
                key: true,
                name: true,
                description: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        tasks: true,
                        surveyTemplates: true,
                        participants: true,
                    },
                },
            },
        });

        return NextResponse.json({ok: true, studies});
    } catch (err) {
        return NextResponse.json(
            {ok: false, error: err instanceof Error ? err.message : "Unauthorized"},
            {status: 401},
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        await requireApiAuthUserId();

        const body = await req.json();
        const parsed = CreateStudyPayloadSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                {ok: false, error: "Validation failed", issues: parsed.error.flatten()},
                {status: 400},
            );
        }

        const payload = parsed.data;

        // Transaction: either everything is created or nothing is.
        const created = await prisma.$transaction(async (tx) => {
            // Create study + nested tasks + templates + questions + options.
            const study = await tx.study.create({
                data: {
                    key: payload.study.key,
                    name: payload.study.name,
                    description: payload.study.description ?? null,

                    tasks: {
                        create: payload.tasks.map((t) => ({
                            taskNumber: t.taskNumber,
                            title: t.title,
                            promptMarkdown: t.promptMarkdown,
                            metadata: t.metadata ?? undefined,
                        })),
                    },

                    surveyTemplates: {
                        create: payload.templates.map((tpl) => ({
                            key: tpl.key,
                            name: tpl.name,
                            description: tpl.description ?? null,
                            questions: {
                                create: tpl.questions
                                    .slice()
                                    .sort((a, b) => a.order - b.order)
                                    .map((q) => ({
                                        key: q.key,
                                        text: q.text,
                                        type: q.type,
                                        required: q.required,
                                        order: q.order,

                                        // Scale config only for SCALE_NRS.
                                        scaleMin: q.type === "SCALE_NRS" ? q.scaleMin ?? null : null,
                                        scaleMax: q.type === "SCALE_NRS" ? q.scaleMax ?? null : null,
                                        scaleStep: q.type === "SCALE_NRS" ? q.scaleStep ?? null : null,

                                        // Options only for SINGLE/MULTI.
                                        options:
                                            q.type === "SINGLE_CHOICE" || q.type === "MULTI_CHOICE"
                                                ? {
                                                    create: (q.options ?? [])
                                                        .slice()
                                                        .sort((a, b) => a.order - b.order)
                                                        .map((opt) => ({
                                                            value: opt.value,
                                                            label: opt.label,
                                                            order: opt.order,
                                                        })),
                                                }
                                                : undefined,
                                    })),
                            },
                        })),
                    },
                },
                select: {id: true, key: true, name: true},
            });

            return study;
        });

        return NextResponse.json({ok: true, study: created}, {status: 201});
    } catch (err) {
        // Prisma unique constraint violations etc. land here.
        // If the study key already exists, return a Conflict (409) so the UI can show a clear message.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            const target = (err.meta as any)?.target;
            const targets = Array.isArray(target) ? target : target ? [target] : [];
            if (targets.includes("key")) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: "Study key already exists. Please choose a different study.key (it must be unique).",
                    },
                    {status: 409},
                );
            }
        }

        return NextResponse.json(
            {ok: false, error: err instanceof Error ? err.message : "Create failed"},
            {status: 500},
        );
    }
}
