// Minimal business identity the UI needs for scoping screens and navigation.
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

// The value space a parameter's answers live in. Owner-defined parameters must
// be CATEGORICAL, CONTINUOUS, or TIME so collected answers are ML-ready; TEXT
// is reserved for the system "Name" parameter and legacy rows.
export type BusinessParameterTypeDto = "CATEGORICAL" | "CONTINUOUS" | "TIME" | "TEXT";

export type BusinessParameterConfigDto = {
  // CATEGORICAL: closed list of allowed values (2-30 entries).
  options?: string[];
  // CONTINUOUS: optional inclusive bounds and display unit.
  min?: number;
  max?: number;
  unit?: string;
};

export type BusinessSettingsParameterDto = {
  id: number;
  paramName: string;
  use: boolean;
  paramType: BusinessParameterTypeDto;
  config?: BusinessParameterConfigDto | null;
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
  starterMessage: string | null;
  endMessage: string | null;
  escalationMessage: string | null;
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

// Provider credentials for a messaging channel. Stored encrypted; never
// returned by any endpoint (BusinessChannelDto only exposes hasCredentials).
export type BusinessChannelCredentialsDto = {
  // Twilio subaccount.
  accountSid?: string;
  authToken?: string;
  // Meta WhatsApp Cloud API.
  accessToken?: string;
  phoneNumberId?: string;
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
  // undefined = keep existing credentials; null = remove; object = replace.
  credentials?: BusinessChannelCredentialsDto | null;
};

export type SmsSettingsDto = {
  enabled: boolean;
  senderId: string | null;
};

export type UpdateSmsSettingsRequestDto = SmsSettingsDto;

export type UpdateBusinessSettingsParameterDto = {
  id?: number;
  paramName: string;
  use?: boolean;
  paramType?: BusinessParameterTypeDto;
  config?: BusinessParameterConfigDto | null;
  paramValue?: string | null;
};

export type UpdateBusinessSettingsRequestDto = {
  name: string;
  phone: string;
  email: string;
  // undefined keeps the stored value; null clears it.
  starterMessage?: string | null;
  endMessage?: string | null;
  escalationMessage?: string | null;
  language?: string;
  action?: BusinessSettingsActionDto | null;
};

export type UpsertBusinessParameterRequestDto = UpdateBusinessSettingsParameterDto;

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
  channel: string;
  provider: string;
  conclusion?: string | null;
  createdAt: string;
  messageCount: number;
  lastMessageAt?: string;
  // Sticky once true - set by a human takeover/open-conversation action and
  // never cleared automatically, so the bot never silently reopens it.
  humanManaged: boolean;
  takenOverByUserId?: number | null;
  takenOverAt?: string | null;
  releasedAt?: string | null;
};

// Message transcript contract consumed by the conversation details screen.
export type ConversationMessageDto = {
  id: number;
  conversationId: number;
  type: "user" | "bot" | "system" | "human";
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

// Human takeover: pause the bot on an in-progress conversation and send the
// agent's own message.
export type TakeoverConversationRequestDto = {
  clientId: number;
  message: string;
};

// Release a takeover, closing the conversation for good. `humanManaged` stays
// true afterward so the bot never silently reopens it.
export type ReleaseConversationRequestDto = {
  clientId: number;
};

// Human-initiated conversation: the client may not exist yet, so this is
// looked up/created by phone number rather than by clientId.
export type OpenHumanConversationRequestDto = {
  phoneNumber: string;
  message: string;
  clientName?: string;
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

export type LeadDto = LeadSummaryDto & {
  notes?: string | null;
};

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

export type CreatePublicLeadResponseDto = {
  message: string;
  leadId: number;
};

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

export type AssignLeadRequestDto = {
  memberId: number;
  expectedMemberId: number | null;
};

export type UnassignLeadRequestDto = {
  expectedMemberId: number;
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
  caseDocumentFollowUpEnabled: boolean;
  caseDocumentFollowUpHour: number | null;
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
  caseDocumentFollowUpEnabled?: boolean;
  caseDocumentFollowUpHour?: number | null;
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
