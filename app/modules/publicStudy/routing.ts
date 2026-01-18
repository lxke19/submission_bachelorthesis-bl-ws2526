// app/modules/publicStudy/routing.ts
//
// Purpose:
// - Single mapping from ParticipantStep to the page route.
// - Keeps routing consistent across /api/study/resume and step enforcement.
//
// Why:
// - You want strict flow control: user cannot freely navigate.
// - Central mapping makes redirects deterministic and easy to maintain.

export type ParticipantStep =
    | "WELCOME"
    | "PRE_SURVEY"
    | "TASK1_CHAT"
    | "TASK1_POST_SURVEY"
    | "TASK2_CHAT"
    | "TASK2_POST_SURVEY"
    | "TASK3_CHAT"
    | "TASK3_POST_SURVEY"
    | "FINAL_SURVEY"
    | "DONE";

export function stepToPath(accessCode: string, step: ParticipantStep, currentTaskNumber?: number | null) {
    switch (step) {
        case "WELCOME":
            return "/study";
        case "PRE_SURVEY":
            return `/study/${accessCode}/pre`;

        case "TASK1_CHAT":
            return `/study/${accessCode}/task/1`;
        case "TASK1_POST_SURVEY":
            return `/study/${accessCode}/task/1/post`;

        case "TASK2_CHAT":
            return `/study/${accessCode}/task/2`;
        case "TASK2_POST_SURVEY":
            return `/study/${accessCode}/task/2/post`;

        case "TASK3_CHAT":
            return `/study/${accessCode}/task/3`;
        case "TASK3_POST_SURVEY":
            return `/study/${accessCode}/task/3/post`;

        case "FINAL_SURVEY":
            return `/study/${accessCode}/final`;

        case "DONE":
            return `/study/${accessCode}/done`;

        default:
            // What: fallback.
            // Why: if step is unknown, route to /study entry.
            return "/study";
    }
}
