import type { LastMessages } from "./messageTypes";

export type BusinessContextForPrompt = {
    businessProfile: {
        name: string;
        language: string;
        tone: string;
    };
    description: string | null;
    serviceCatalog: {
        allowedServices: string[];
        commonIntents: string[];
    };
    conversationPolicy: {
        paceWhen: string[];
        escalateWhen: string[];
        closeWhen: string[];
    };
    knownClientContext: {
        summary?: string;
        reusablePreferences: string[];
        previousAnswers: Record<string, string>;
    } | null;
}

export enum ConversationState
{
    start = "start",
    collecting = "collecting",
    pacing = "pacing",
    closing = "closing",
    failure = "failure",
    ended = "ended",
    scheduling = "scheduling",
    schedulingConfirmed = "schedulingConfirmed",
    schedulingFailed = "schedulingFailed"
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
    businessContext: BusinessContextForPrompt | null;
    conclusion?: string;
}

export type StateMachineOutput = {
    conversationEvent: ConversationEvent;
    newConclusion: string;
    params?: Record<string, string | number | null>;
}


