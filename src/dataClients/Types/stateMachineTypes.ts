import type { LastMessages } from "./messageTypes";
import type { BusinessParamDefinition } from "./paramTypes";

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
    updateParams = "updateParams",
    // Scheduling negotiation: only meaningful after the bot proposed setting
    // up a callback. Agreement without a concrete time keeps negotiating.
    schedulingAgreed = "schedulingAgreed",
    schedulingDeclined = "schedulingDeclined"
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
    ignore = "ignore",
    proposeSchedule = "proposeSchedule",
    confirmSchedule = "confirmSchedule"
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
    ignore = "ignore",
    proposeSchedule = "proposeSchedule",
    confirmSchedule = "confirmSchedule"
}




export type StateMachineInput = {
    currentState: ConversationState;
    messageContent: string;
    collectedParams: Record<string, string | number | null>;
    // Typed value-space definitions for the business's active parameters; the
    // prompt renders these and extracted values are validated against them.
    paramDefinitions?: BusinessParamDefinition[];
    lastMessages:LastMessages[];
    businessContext: BusinessContextForPrompt | null;
    conclusion?: string;
    // True when the business opted into AI-scheduled callbacks
    // (BusinessAction BOOK_APPOINTMENT).
    schedulingEnabled?: boolean;
    // Previously agreed callback time (ISO), if any.
    scheduledFor?: string;
}

export type StateMachineOutput = {
    conversationEvent: ConversationEvent;
    conversationMode?: ConversationMode;
    responseIntent?: ResponseIntent;
    newConclusion: string;
    params?: Record<string, string | number | null>;
    // ISO 8601 callback time extracted during scheduling; validated by the
    // executer before it can trigger a transition.
    scheduledTime?: string;
}


