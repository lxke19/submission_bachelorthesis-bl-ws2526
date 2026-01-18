// app/(public)/study/[accessCode]/task/[taskNumber]/task-chat-client.tsx
"use client";

import React from "react";
import {Thread} from "@/components/thread";
import {StreamProvider} from "@/providers/Stream";
import {ThreadProvider} from "@/providers/Thread";
import {ArtifactProvider} from "@/components/thread/artifact";
import TaskChatFlowClient from "@/app/modules/publicStudy/components/TaskChatFlowClient";
import ChatPersistenceController from "@/app/modules/publicStudy/components/ChatPersistenceController";

export default function TaskChatClient(props: {
    accessCode: string;
    taskNumber: string;
}) {
    return (
        <TaskChatFlowClient accessCode={props.accessCode} taskNumber={props.taskNumber}>
            <ThreadProvider>
                <StreamProvider>
                    <ArtifactProvider>
                        <div className="h-full min-h-0">
                            <ChatPersistenceController taskNumber={Number(props.taskNumber)}/>
                            <Thread/>
                        </div>
                    </ArtifactProvider>
                </StreamProvider>
            </ThreadProvider>
        </TaskChatFlowClient>
    );
}
