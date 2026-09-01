export type BusinessSummaryDto = {
  id: number;
  name: string;
  phone: string;
  email: string;
};

export type AdminCreateBusinessRequestDto = {
  name: string;
  phone: string;
  email: string;
  language?: string;
};

export type SmsSettingsDto = {
  enabled: boolean;
  senderId: string | null;
  messagingServiceConfigured: boolean;
};

export type UpdateSmsSettingsRequestDto = {
  enabled: boolean;
  senderId: string | null;
};

export type LeadStatusDto =
  | "NEW"
  | "QUALIFYING"
  | "QUALIFIED"
  | "ASSIGNED"
  | "FOLLOW_UP"
  | "WON"
  | "LOST"
  | "CLOSED";

export type LeadSourceDto =
  | "WHATSAPP"
  | "MANUAL"
  | "FACEBOOK"
  | "GOOGLE_ADS"
  | "WEBSITE"
  | "OTHER";

export type LeadSummaryDto = {
  id: number;
  businessId: number;
  clientId?: number | null;
  memberId?: number | null;
  status: LeadStatusDto;
  source: LeadSourceDto;
  score?: number | null;
  summary?: string | null;
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string | null;
  followUpAt?: string | null;
  closedAt?: string | null;
};

export type LeadDto = LeadSummaryDto & { notes?: string | null };

export type CreateManualLeadRequestDto = {
  clientId?: number;
  name?: string;
  email?: string;
  phoneNumber?: string;
  memberId?: number;
  status?: LeadStatusDto;
  source?: LeadSourceDto;
  score?: number;
  summary?: string;
  notes?: string;
  followUpAt?: string | null;
};

export type CreatePublicLeadRequestDto = {
  name?: string;
  email?: string;
  phoneNumber: string;
  source?: LeadSourceDto;
  summary?: string;
  notes?: string;
};

export type CreatePublicLeadResponseDto = { message: string; leadId: number };

export type UpdateLeadRequestDto = {
  status?: LeadStatusDto;
  score?: number | null;
  summary?: string | null;
  notes?: string | null;
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  followUpAt?: string | null;
};

export type AssignLeadRequestDto = { memberId: number; expectedMemberId: number | null };
export type UnassignLeadRequestDto = { expectedMemberId: number };
