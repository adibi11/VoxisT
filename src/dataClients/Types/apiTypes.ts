
export enum CommunicationChannel {
    Whatsapp = "whatsapp",
    Sms = "sms",
    Voice = "voice",
    Webchat = "webchat"
}

export enum MessageProvider {
    Twilio = "twilio",
    Internal = "internal"
}


export type Message = {
   type: ActionType;
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


export enum MessageType {
    HandleMessage = "handleMessage",
    HandleStartConversation = "handleStartConversation",
    HandleEndConversation = "handleEndConversation",
    Unknown = "unknown"
}

export enum ActionType {
    Create = "create",
    Update = "update",
    Delete = "delete",
    HandleMessage = "handleMessage",
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
}
