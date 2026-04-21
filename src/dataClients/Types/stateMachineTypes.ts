import { LastMessages } from "./messageTypes";



export enum ConversationEvent
{
    concern = "clientConcern",
    extractedParams = "extractedParams",
    tryEnding = "tryEnding",
    ended = "ended",
    failure = "failure",
    startConversation = "startConversation"
}


export type StateMachineInput = {
    currentState: "start" | "collecting" | "closing"|"failure";
    messageContent: string;
    collectedParams: Record<string, string | number | null>;
    lastMessages:LastMessages[];
    conclusion?: string;
}

export type StateMachineOutput = {
    conversationEvent: ConversationEvent;
    newConclusion: string;
    params?: Record<string, string | number | null>;
}


