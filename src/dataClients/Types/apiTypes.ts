export enum CommunicationChannel {
  Sms = "sms",
  Voice = "voice",
}

export enum MessageProvider {
  Twilio = "twilio",
  Internal = "internal"
}

export type BusinessDto = {
  name: string;
  phone: string;
  email: string;
  language?: string;
};
