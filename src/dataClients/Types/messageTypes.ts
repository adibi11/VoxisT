
import {ConversationEvent, ConversationState, StateMachineInput, StateMachineOutput} from "./stateMachineTypes";
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
    collectedParams: Record<string, string | number | null>;
    lastMessages:LastMessages[];
    updatedAt: Date;
    conclusion?: string;
}   


export type LastMessages =
{
    role: "user" | "bot";
    content: string;
}