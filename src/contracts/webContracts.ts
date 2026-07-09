// Minimal business identity the UI needs for scoping screens and navigation.
export type BusinessSummaryDto = {
  id: number;
  name: string;
  phone: string;
  email: string;
};

export type BusinessContextProfileDto = {
  name: string;
  language: string;
  tone: string;
};

export type UpsertBusinessContextRequestDto = {
  businessProfile: BusinessContextProfileDto;
  description?: string | null;
  serviceCatalog: unknown;
  conversationPolicy: unknown;
  knownClientContext?: unknown;
};

export type BusinessContextResponseDto = {
  id?: number;
  businessId: number;
  businessProfile: BusinessContextProfileDto;
  description?: string | null;
  serviceCatalog: unknown;
  conversationPolicy: unknown;
  knownClientContext?: unknown;
};

// Client list item for a specific business.
export type ClientSummaryDto = {
  id: number;
  phoneNumber: string;
  conversationCount: number;
  lastConversationAt?: string;
};

// Conversation list item for a business/client pair or business-wide conversation view.
export type ConversationSummaryDto = {
  id: number;
  businessId: number;
  clientId: number;
  status: string;
  conclusion?: string | null;
  createdAt: string;
  messageCount: number;
  lastMessageAt?: string;
};

// Message transcript contract consumed by the conversation details screen.
export type ConversationMessageDto = {
  id: number;
  conversationId: number;
  type: "user" | "bot" | "system";
  content: string;
  status: string;
  createdAt: string;
};

// Parameter answers shown near a conversation transcript.
export type ConversationParamAnswerDto = {
  id: number;
  paramName: string;
  paramValue: string;
  createdAt: string;
};

export type ConversationMessagesResponseDto = {
  conversation: ConversationSummaryDto;
  messages: ConversationMessageDto[];
  params: ConversationParamAnswerDto[];
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
  phoneNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string | null;
  followUpAt?: string | null;
  closedAt?: string | null;
};

export type LeadDto = LeadSummaryDto & {
  notes?: string | null;
};

export type CreateManualLeadRequestDto = {
  clientId?: number;
  name?: string;
  phoneNumber?: string;
  memberId?: number;
  status?: LeadStatusDto;
  source?: LeadSourceDto;
  score?: number;
  summary?: string;
  notes?: string;
  followUpAt?: string | null;
};

export type UpdateLeadRequestDto = {
  memberId?: number | null;
  status?: LeadStatusDto;
  score?: number | null;
  summary?: string | null;
  notes?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  followUpAt?: string | null;
};

export type FollowUpStatusDto =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "SKIPPED"
  | "FAILED"
  | "CANCELED";

export type BusinessFollowUpPolicyDto = {
  id: number;
  businessId: number;
  enabled: boolean;
  timezone: string;
  delayMinutes: number;
  allowedStartHour?: number | null;
  allowedEndHour?: number | null;
  maxFollowUps: number;
  messageTemplate?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertBusinessFollowUpPolicyRequestDto = {
  enabled?: boolean;
  timezone?: string;
  delayMinutes?: number;
  allowedStartHour?: number | null;
  allowedEndHour?: number | null;
  maxFollowUps?: number;
  messageTemplate?: string | null;
};

export type ConversationFollowUpStateDto = {
  conversationId: number;
  businessId: number;
  clientId: number;
  status: string;
  channel: string;
  provider: string;
  createdAt: string;
  lastUserMessageAt?: string | null;
  lastBotMessageAt?: string | null;
  lastFollowUpAt?: string | null;
  followUpCount: number;
  nextFollowUpAt?: string | null;
};

export type UpdateConversationFollowUpStateRequestDto = {
  lastUserMessageAt?: string | null;
  lastBotMessageAt?: string | null;
  lastFollowUpAt?: string | null;
  followUpCount?: number;
  nextFollowUpAt?: string | null;
};

export type ConversationFollowUpDto = {
  id: number;
  businessId: number;
  conversationId: number;
  leadId?: number | null;
  status: FollowUpStatusDto;
  scheduledFor: string;
  sentAt?: string | null;
  skippedReason?: string | null;
  messageBody?: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type CreateConversationFollowUpRequestDto = {
  conversationId: number;
  leadId?: number | null;
  status?: FollowUpStatusDto;
  scheduledFor: string;
  sentAt?: string | null;
  skippedReason?: string | null;
  messageBody?: string | null;
  metadata?: unknown;
};

export type UpdateConversationFollowUpRequestDto = {
  leadId?: number | null;
  status?: FollowUpStatusDto;
  scheduledFor?: string;
  sentAt?: string | null;
  skippedReason?: string | null;
  messageBody?: string | null;
  metadata?: unknown;
};
