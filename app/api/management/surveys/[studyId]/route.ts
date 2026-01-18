// app/api/management/surveys/[studyId]/route.ts
//
// Purpose:
// - GET: Read-only detail view of one Study (tasks + templates + questions + options).
//
// Auth:
// - Admin-only.
//
// Notes:
// - Used by Management "details" page.
// - We intentionally do not expose PATCH/DELETE.

import {NextRequest, NextResponse} from "next/server";
import {prisma} from "@/app/lib/prisma";
import {requireApiAuthUserId} from "@/app/lib/auth";

export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ studyId: string }> },
) {
    try {
        await requireApiAuthUserId();
        const {studyId} = await ctx.params;

        const study = await prisma.study.findUnique({
            where: {id: studyId},
            include: {
                tasks: {orderBy: {taskNumber: "asc"}},
                surveyTemplates: {
                    orderBy: {key: "asc"},
                    include: {
                        questions: {
                            orderBy: {order: "asc"},
                            include: {options: {orderBy: {order: "asc"}}},
                        },
                    },
                },
                _count: {select: {participants: true}},
            },
        });

        if (!study) {
            return NextResponse.json({ok: false, error: "Not found"}, {status: 404});
        }

        return NextResponse.json({ok: true, study});
    } catch (err) {
        return NextResponse.json(
            {ok: false, error: err instanceof Error ? err.message : "Unauthorized"},
            {status: 401},
        );
    }
}
