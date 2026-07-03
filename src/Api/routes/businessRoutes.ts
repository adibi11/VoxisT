import express from 'express';
import { IDatabaseClient } from '../../dataClients/SqlClient/sqlInterface';
import { ILogger } from '../../logging/logger';
import { requireAuth,AuthenticatedRequest, requirePlatformAdmin  } from '../authMiddleware';

    

export function getBusinessRoutes(app:express.Application, sql: IDatabaseClient, logger: ILogger) {
    app.get("/admin/businesses", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!requirePlatformAdmin(authReq, res)) {
          return;
        }
    
        const businesses = await sql.getAllBusinesses();
        logger.info("admin.businesses.list.succeeded", {
          userId: authReq.auth.userId,
          count: businesses.length
        });
        return res.status(200).json(businesses);
      } catch (error) {
        logger.error("admin.businesses.list.failed", { error });
        return res.status(500).json({ message: "Failed to fetch businesses" });
      }
    });

    app.get("/me/businesses", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businesses = await sql.getBusinessesForUser(authReq.auth.userId);
        logger.info("businesses.list.succeeded", {
          userId: authReq.auth.userId,
          count: businesses.length
        });
        return res.status(200).json(businesses);
      } catch (error) {
        logger.error("businesses.list.failed", { error });
        return res.status(500).json({ message: "Failed to fetch businesses" });
      }
    });
    
}
