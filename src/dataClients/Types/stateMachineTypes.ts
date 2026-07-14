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
    startConversation = "startConversation",
    updateParams = "updateParams"
}

export enum ConversationMode
{
    neutral = "neutral",
    leadin = "leadin",
    validating = "validating",
    reflecting = "reflecting",
    pacing = "pacing",
    clarifying = "clarifying"
}

export enum ResponseIntent
{
    welcome = "welcome",
    askForParam = "askForParam",
    acknowledgeConcern = "acknowledgeConcern",
    clarify = "clarify",
    close = "close",
    end = "end",
    escalate = "escalate",
    ignore = "ignore"
}

export enum BotMsg
{
    sendWelcomeMessage = "sendWelcomeMessage",
    askForParams = "askForParams",
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
    conversationMode?: ConversationMode;
    responseIntent?: ResponseIntent;
    newConclusion: string;
    params?: Record<string, string | number | null>;
}


