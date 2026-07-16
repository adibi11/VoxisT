import express from 'express';
import { IDatabaseClient } from '../../dataClients/SqlClient/sqlInterface';
import { ILogger } from '../../logging/logger';
import { requireAuth,AuthenticatedRequest, requirePlatformAdmin, requireBusinessAccess  } from '../authMiddleware';


export function getClientRoutes(app:express.Router, sql: IDatabaseClient, logger: ILogger) {
    app.get("/businesses/:businessId/clients", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ message: "Invalid businessId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }
    
        const clients = await sql.getClientsByBusiness(businessId);
        logger.info("clients.list.succeeded", {
          userId: authReq.auth.userId,
          businessId,
          count: clients.length
        });
        return res.status(200).json(clients);
      } catch (error) {
        logger.error("clients.list.failed", { error });
        return res.status(500).json({ message: "Failed to fetch clients" });
      }
    });
    

}
