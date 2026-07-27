
import {ConversationEvent, ConversationState, StateMachineInput, StateMachineOutput} from "./stateMachineTypes";
import { CommunicationChannel, MessageProvider } from "./apiTypes";
export type Message = {
   userMessage: string;
    botResponse: string;
    messageId: number;
    stage: MessageStage;
    
};

export enum MessageStage {
    Received = "received",
    Processing = "processing",
    Completed = "completed",
    Failed = "failed"
}

export type Conversation = {
    id: number;
    lastMessageId: number;
    clientId: string;
    businessId: string;
    conclusion?: string;
    messages: Message[];
};

export type Business = {
    id: number;
    name: string;
    phone: string;
    email: string;
}

export type BusinessContext = {
    id?: number;
    businessId: number;
    businessProfile: {
        name: string;
        language: string;
        tone: string;
    };
    description?: string | null;
    serviceCatalog: unknown;
    conversationPolicy: unknown;
    knownClientContext?: unknown;
}

export type Client = {
    id: number;
    name: string;
    phone: string;
    email: string;
}

export type ConversationEntity = {
    busienss: Business;
    client: Client;
    conversation: Conversation;
    businessParams: BusinessParam[];
    
}


export type BusinessParam = {
    paramName: string;
    paramValue?: string;
    businessId: number;
}

export enum MessageType {
    User = "user",
    Bot = "bot"
}

export type ConversationCacheState = {
    conversationId: number;
    state: ConversationState;
    channel: CommunicationChannel;
    provider?: MessageProvider;
    collectedParams: Record<string, string | number | null>;
    lastMessages:LastMessages[];
    updatedAt: Date;
    conclusion?: string;
    phone: string;
    // Scheduling negotiation bookkeeping. Attempts are counted so the FSM -
    // not the LLM - decides when to stop pursuing a callback.
    schedulingAttempts?: number;
    scheduledFor?: string;
    scheduledTaskId?: number;
}


export type LastMessages =
{
    role: "user" | "bot";
    content: string;
}
