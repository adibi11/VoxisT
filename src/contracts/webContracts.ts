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
