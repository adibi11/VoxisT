// Minimal business identity the UI needs for scoping screens and navigation.
export type BusinessSummaryDto = {
  id: number;
  name: string;
  phone: string;
  email: string;
};

export type BusinessResponseMetricsDto = {
  businessId: number;
  from: string;
  to: string;
  averageResponseTimeMs: number | null;
  averageResponseTimeSeconds: number | null;
  responsePairCount: number;
  conversationCount: number;
};

export type BusinessActionTypeDto =
  | "BOOK_APPOINTMENT"
  | "SEND_PAYMENT_LINK"
  | "SEND_VIDEO"
  | "HUMAN_HANDOFF"
  | "SEND_EMAIL"
  | "NONE";

export type BusinessSettingsParameterDto = {
  id: number;
  paramName: string;
  use: boolean;
  paramValue?: string | null;
};

export type BusinessSettingsActionDto = {
  action: BusinessActionTypeDto;
  provider?: string | null;
  config?: unknown;
};

export type BusinessSettingsDto = {
  id: number;
  name: string;
  phone: string;
  email: string;
  starterMessage: string;
  endMessage: string;
  escalationMessage: string;
  language: string;
  parameters: BusinessSettingsParameterDto[];
  action?: BusinessSettingsActionDto | null;
};

export type BusinessChannelStatusDto = "pending" | "active" | "disabled" | "failed";

export type BusinessChannelOnboardingTypeDto = "manual" | "embedded_signup" | "oauth";

export type BusinessChannelDto = {
  id: number;
  businessId: number;
  channel: string;
  provider: string;
  displayName?: string | null;
  status: BusinessChannelStatusDto;
  onboardingType: BusinessChannelOnboardingTypeDto;
  config?: unknown;
  externalAccountId?: string | null;
  externalPhoneNumberId?: string | null;
  webhookUrl?: string | null;
  isDefault: boolean;
  hasCredentials: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertBusinessChannelRequestDto = {
  channel: string;
  provider: string;
  displayName?: string | null;
  status?: BusinessChannelStatusDto;
  onboardingType?: BusinessChannelOnboardingTypeDto;
  config?: unknown;
  externalAccountId?: string | null;
  externalPhoneNumberId?: string | null;
  webhookUrl?: string | null;
  isDefault?: boolean;
};

export type UpdateBusinessSettingsParameterDto = {
  id?: number;
  paramName: string;
  use?: boolean;
  paramValue?: string | null;
};

export type UpdateBusinessSettingsRequestDto = {
  name: string;
  phone: string;
  email: string;
  starterMessage: string;
  endMessage: string;
  escalationMessage: string;
  language?: string;
  parameters: UpdateBusinessSettingsParameterDto[];
  action?: BusinessSettingsActionDto | null;
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

export type CreatePublicLeadRequestDto = {
  name?: string;
  phoneNumber: string;
  source?: LeadSourceDto;
  summary?: string;
  notes?: string;
};

export type CreatePublicLeadResponseDto = {
  message: string;
  leadId: number;
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
