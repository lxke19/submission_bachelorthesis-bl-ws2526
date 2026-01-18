// app/(public)/study/[accessCode]/task/[taskNumber]/page.tsx
//
// Server Page:
// - unwrap params (Next 16: params ist Promise)
// - rendert Client UI

import TaskChatClient from "./task-chat-client";

export default async function TaskChatPage({
                                               params,
                                           }: {
    params: Promise<{ accessCode: string; taskNumber: string }>;
}) {
    const {accessCode, taskNumber} = await params;
    return <TaskChatClient accessCode={accessCode} taskNumber={taskNumber}/>;
}
