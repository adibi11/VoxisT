import {
  Message as MessageType,
  Conversation as ConversationType,
  Business as BusinessType,
  Client as ClientType,
  ConversationEntity,
  MessageStage,
  BusinessParam,
} from "./messageTypes";
import { Message as PrismaMessage, Conversation as PrismaConversation, Business as PrismaBusiness, Client as PrismaClient } from "../../generated/prisma/client";


export function mapPrismaMessageToInternal(prismaMessage: PrismaMessage): MessageType {
  return {
    userMessage: prismaMessage.content,
    botResponse: "",
    messageId: prismaMessage.id,
    stage: MessageStage.Received,

  };
}
/**
 * Safely converts a Prisma Business to an internal Business type
 */
export function mapPrismaBusinessToInternal(prismaBusiness: PrismaBusiness): BusinessType {
  return {
    id: prismaBusiness.id,
    name: prismaBusiness.businessName,
    phone: prismaBusiness.businessPhone ?? "",
    email: prismaBusiness.businessEmail ?? "",
  };
}

/**
 * Safely converts a Prisma Client to an internal Client type
 */
export function mapPrismaClientToInternal(prismaClient: PrismaClient): ClientType {
  return {
    id: prismaClient.id,
    name: "", 
    phone: prismaClient.phoneNumber ?? "",
    email: "",

  };
}
/**
 * Safely converts a Prisma Conversation (with relations) to an internal Conversation type
 */
export function mapPrismaConversationToInternal(
  prismaConversation: PrismaConversation & {
    messages?: PrismaMessage[];
  }
): ConversationType {
  return {
    id: prismaConversation.id,
    lastMessageId: -1,
    clientId: String(prismaConversation.clientId),
    businessId: String(prismaConversation.businessId),
    conclusion: prismaConversation.conclusion ?? undefined,
    messages: (prismaConversation.messages ?? []).map(mapPrismaMessageToInternal),
  };
}
/**
 * Safely converts Prisma types to a ConversationEntity with full type safety
 */
export function mapToConversationEntity(
  conversation: PrismaConversation & { messages?: PrismaMessage[] },
  business: PrismaBusiness,
  client: PrismaClient,
  businessParams: BusinessParam[]
): ConversationEntity {
  return {
    busienss: mapPrismaBusinessToInternal(business), // Note: typo in original type
    client: mapPrismaClientToInternal(client),
    conversation: mapPrismaConversationToInternal(conversation),
    businessParams: businessParams.map(param => ({
      paramName: param.paramName,
      paramValue: param.paramValue,
      businessId: param.businessId
    }))
  };
}
