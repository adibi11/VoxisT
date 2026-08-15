
import { ActionType } from "../../generated/prisma/client";

export enum CommunicationChannel {
    Whatsapp = "whatsapp",
    Sms = "sms",
    Voice = "voice",
    Webchat = "webchat"
}

export enum MessageProvider {
    Twilio = "twilio",
    MetaWhatsapp = "meta_whatsapp",
    Internal = "internal"
}


export type Message = {
   type: ApiActionType;
   content: string;
   status: string;
   channel: CommunicationChannel;
   provider?: MessageProvider;
   businessId?: number;
   data?: any;
};

export type JobData = {
    event: Message;
};


export type FollowUpJobData = {
    
    From: string,
    To: string,
    Body: string,
    clientId: number,
    conversationId: number,
    messageId: number
                    
}

export type BusinessMemberConversationMessageData = {
    from: string;
    to: string;
    body: string;
    clientId: number;
    conversationId: number;
    businessMemberUserId: number;
    idempotencyKey: string;
};


export enum MessageType {
    HandleMessage = "handleMessage",
    HandleStartConversation = "handleStartConversation",
    HandleEndConversation = "handleEndConversation",
    Unknown = "unknown"
}

export enum ApiActionType {
    Create = "create",
    Update = "update",
    Delete = "delete",
    HandleMessage = "handleMessage",
    FollowUp = "followUp",
    // Classified at the webhook, before enqueueing: the receiving
    // conversation is human-managed, so this message must never reach the
    // LLM/bot pipeline - it's only persisted and turned into a push
    // notification for the owning agent.
    // Keep the existing wire value so jobs queued before this rename remain processable.
    ClientConversationMessage = "humanConversationMessage",
    BusinessMemberConversationMessage = "businessMemberConversationMessage",
}

export type twillioMessage = {
    From: string;
    To: string;
    Body: string;
    MessageSid?: string;
}

export type BusinessDto = {
    name: string;
    phone: string;
    email: string;
    parameters: BusinessParamDto[];
    starterMessage: string | null;
    endMessage: string | null;
    escalationMessage: string | null;
    language?: string;
}

export type BusinessParamDto = {
    paramName: string;
    paramValue?: string;
    use?: boolean;
}


export type BusinessActionDto = {
    action: ActionType;
    provider?: string;
    config?: any;
    businessId: number;

}


export type PushDeviceDto = {
    appUserId:number;
    expoPushToken: string;
    phonePlatform: PhonePlatform;
    appVersion?: string;
    lastSeenAt?: Date;
    isAcive?: boolean;
    deviceId: string;


}


export enum PhonePlatform 
{
    Ios,
    Android
}

