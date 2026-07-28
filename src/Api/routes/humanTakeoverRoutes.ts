import express from 'express';
import { IDatabaseClient } from '../../dataClients/SqlClient/sqlInterface';
import { ICacheManager } from '../../dataClients/CacheClient/cacheInterface';
import { IOutboundMessageQueue } from '../../QueueClient/queue';
import { ILogger } from '../../logging/logger';
import { CommunicationChannel, MessageProvider } from '../../dataClients/Types/apiTypes';
import { requireAuth, AuthenticatedRequest, requireBusinessAccess } from '../authMiddleware';
import {
  TakeoverConversationRequestDto,
  ReleaseConversationRequestDto,
  OpenHumanConversationRequestDto
} from '../../contracts';

export function getHumanTakeoverRoutes(
  app: express.Router,
  sql: IDatabaseClient,
  cache: ICacheManager,
  outboundQueue: IOutboundMessageQueue,
  logger: ILogger
) {
  // Take over an in-progress conversation: pauses the bot (and cancels any
  // bot reply already queued for delivery), then sends the agent's message.
  app.post("/businesses/:businessId/conversations/:conversationId/takeover", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = Number(req.params.businessId);
      const conversationId = Number(req.params.conversationId);
      const body = req.body as Partial<TakeoverConversationRequestDto>;
      const clientId = Number(body?.clientId);
      const message = typeof body?.message === "string" ? body.message.trim() : "";

      if (!Number.isFinite(businessId) || !Number.isFinite(conversationId) || !Number.isFinite(clientId)) {
        return res.status(400).json({ message: "Invalid businessId, conversationId, or clientId" });
      }
      if (!message) {
        return res.status(400).json({ message: "message is required" });
      }
      if (!requireBusinessAccess(authReq, res, businessId)) {
        return;
      }

      const conversation = await sql.getConversationForBusinessAndClient(businessId, clientId, conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const phoneNumber = await sql.getClientPhoneNumber(clientId);
      if (!phoneNumber) {
        return res.status(404).json({ message: "Client not found" });
      }

      const channel = conversation.channel as CommunicationChannel;
      const provider = conversation.provider as MessageProvider;
      const from = await resolveFromAddress(sql, businessId, provider);

      // Set the cancellation key before anything else so a bot reply that's
      // already in the outbound queue gets dropped rather than racing this.
      await cache.setTakeoverCancellation(businessId, clientId, conversationId);
      const updated = await sql.setHumanTakeover(conversationId, authReq.auth.userId);

      const messageId = await sql.createMessage(conversationId, "human", message);
      await outboundQueue.addOutboundMessage({
        message: {
          channel,
          provider,
          from,
          to: phoneNumber,
          body: message,
          businessId,
          clientId,
          conversationId,
          messageId,
          origin: "human"
        }
      });

      logger.info("conversation.takeover.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        clientId,
        conversationId
      });
      return res.status(200).json(updated);
    } catch (error) {
      logger.error("conversation.takeover.failed", { error });
      return res.status(500).json({ message: "Failed to take over conversation" });
    }
  });

  // Release a takeover: closes the conversation for good. humanManaged stays
  // true, so the bot never silently reopens it on a later inbound message.
  app.post("/businesses/:businessId/conversations/:conversationId/release", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = Number(req.params.businessId);
      const conversationId = Number(req.params.conversationId);
      const body = req.body as Partial<ReleaseConversationRequestDto>;
      const clientId = Number(body?.clientId);

      if (!Number.isFinite(businessId) || !Number.isFinite(conversationId) || !Number.isFinite(clientId)) {
        return res.status(400).json({ message: "Invalid businessId, conversationId, or clientId" });
      }
      if (!requireBusinessAccess(authReq, res, businessId)) {
        return;
      }

      const conversation = await sql.getConversationForBusinessAndClient(businessId, clientId, conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      await cache.clearTakeoverCancellation(businessId, clientId, conversationId);
      const updated = await sql.releaseHumanTakeover(conversationId);

      logger.info("conversation.release.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        clientId,
        conversationId
      });
      return res.status(200).json(updated);
    } catch (error) {
      logger.error("conversation.release.failed", { error });
      return res.status(500).json({ message: "Failed to release conversation" });
    }
  });

  // Human-initiated conversation: the client may not exist yet, so it's
  // looked up/created by phone number rather than by clientId. The bot never
  // engages - the conversation is created already human-managed.
  app.post("/businesses/:businessId/conversations/open", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = Number(req.params.businessId);
      const body = req.body as Partial<OpenHumanConversationRequestDto>;
      const phoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber.trim() : "";
      const message = typeof body?.message === "string" ? body.message.trim() : "";

      if (!Number.isFinite(businessId) || !phoneNumber || !message) {
        return res.status(400).json({ message: "Invalid businessId, phoneNumber, or message" });
      }
      if (!requireBusinessAccess(authReq, res, businessId)) {
        return;
      }

      const client = await sql.getOrCreateClientByPhone(phoneNumber);
      if (body.clientName) {
        await sql.updateClientName(client.id, body.clientName);
      }

      const channel = CommunicationChannel.Whatsapp;
      const provider = MessageProvider.Twilio;
      const from = await resolveFromAddress(sql, businessId, provider);

      const conversation = await sql.createHumanConversation(client.id, businessId, authReq.auth.userId, channel, provider);
      await cache.setActiveConversationId(client.id, businessId, conversation.id);
      // Defensive: closes the race with any inbound message that was already
      // classified as bot-lane by the webhook a moment before this ran.
      await cache.setTakeoverCancellation(businessId, client.id, conversation.id);

      const messageId = await sql.createMessage(conversation.id, "human", message);
      await outboundQueue.addOutboundMessage({
        message: {
          channel,
          provider,
          from,
          to: phoneNumber,
          body: message,
          businessId,
          clientId: client.id,
          conversationId: conversation.id,
          messageId,
          origin: "human"
        }
      });

      logger.info("conversation.open.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        clientId: client.id,
        conversationId: conversation.id
      });
      return res.status(201).json(conversation);
    } catch (error) {
      logger.error("conversation.open.failed", { error });
      return res.status(500).json({ message: "Failed to open conversation" });
    }
  });
}

async function resolveFromAddress(sql: IDatabaseClient, businessId: number, provider: MessageProvider): Promise<string> {
  const resolved = await sql.businessChannelRepository.GetChannelForOutbound(businessId, provider);
  const from = resolved?.channel.externalPhoneNumberId;
  if (!from) {
    throw new Error(`No outbound channel configured for business ${businessId} provider ${provider}`);
  }
  return from;
}
