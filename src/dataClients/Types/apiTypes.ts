
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
    starterMessage: string;
    endMessage: string;
    escalationMessage: string;
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

