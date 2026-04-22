import { ignoreOverride } from "openai/_vendor/zod-to-json-schema/Options.mjs";
import { LastMessages } from "./messageTypes";

export enum ConversationState
{
    start = "start",
    collecting = "collecting",
    pacing = "pacing",
    closing = "closing",
    failure = "failure",
    ended = "ended"
}

export enum ConversationEvent
{
    concern = "clientConcern",
    ended = "ended",
    failure = "failure",
    tryEnding = "tryEnding",
    finishedPacing = "finishedPacing",
    startConversation = "startConversation",
    updateParams = "updateParams"
}

export enum Action
{
    sendWelcomeMessage = "sendWelcomeMessage",
    askForParams = "askForParams",
    tryPacing = "tryPacing",
    tryClosing = "tryClosing",
    endConversation = "endConversation",
    applyParams = "applyParams",
    escalateToHuman = "escalateToHuman",
    clarify = "clarify",
    ignore = "ignore"
}


export type StateMachineInput = {
    currentState: ConversationState;
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


