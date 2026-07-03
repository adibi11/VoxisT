import express from 'express';
import { IDatabaseClient } from '../../dataClients/SqlClient/sqlInterface';
import { ILogger } from '../../logging/logger';
import { requireAuth,AuthenticatedRequest, requirePlatformAdmin, requireBusinessAccess  } from '../authMiddleware';



export function getConversationRoutes(app:express.Application, sql: IDatabaseClient, logger: ILogger) {
    app.get("/businesses/:businessId/conversations", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
        if (!Number.isFinite(businessId) || (clientId !== undefined && !Number.isFinite(clientId))) {
          return res.status(400).json({ message: "Invalid businessId or clientId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }
    
        const conversations = await sql.getConversationsByBusinessAndClient(businessId, clientId);
        logger.info("conversations.list.succeeded", {
          userId: authReq.auth.userId,
          businessId,
          clientId,
          count: conversations.length
        });
        return res.status(200).json(conversations);
      } catch (error) {
        logger.error("conversations.list.failed", { error });
        return res.status(500).json({ message: "Failed to fetch conversations" });
      }
    });
    
    app.get("/businesses/:businessId/conversations/:conversationId/messages", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        const conversationId = Number(req.params.conversationId);
        if (!Number.isFinite(businessId) || !Number.isFinite(conversationId)) {
          return res.status(400).json({ message: "Invalid businessId or conversationId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }
    
        const result = await sql.getMessagesByConversation(businessId, conversationId);
        if (!result) {
          return res.status(404).json({ message: "Conversation not found" });
        }
    
        logger.info("conversation.messages.succeeded", {
          userId: authReq.auth.userId,
          businessId,
          conversationId,
          messageCount: result.messages.length,
          paramsCount: result.params.length
        });
    
        return res.status(200).json(result);
      } catch (error) {
        logger.error("conversation.messages.failed", { error });
        return res.status(500).json({ message: "Failed to fetch messages" });
      }
    });
}