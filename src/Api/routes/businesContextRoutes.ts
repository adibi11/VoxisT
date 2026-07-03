
import express from 'express';
import { IDatabaseClient } from '../../dataClients/SqlClient/sqlInterface';
    
import { AuthenticatedRequest, requireAuth, requireBusinessAccess} from '../authMiddleware';
import { UpsertBusinessContextRequestDto } from '../../contracts';
import { ILogger } from '../../logging/logger';



export function getBusinessContextRoutes(app:express.Application, sql: IDatabaseClient, logger: ILogger) {

    app.put("/businesses/:businessId/context", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ message: "Invalid businessId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }
    
        const request = req.body as UpsertBusinessContextRequestDto;
        if (!isValidBusinessContextRequest(request)) {
          return res.status(400).json({ message: "Invalid business context" });
        }
    
        const context = await sql.upsertBusinessContext({
          businessId,
          businessProfile: request.businessProfile,
          description: request.description,
          serviceCatalog: request.serviceCatalog,
          conversationPolicy: request.conversationPolicy,
          knownClientContext: request.knownClientContext
        });
    
        logger.info("business.context.upsert.succeeded", {
          userId: authReq.auth.userId,
          businessId
        });
    
        return res.status(200).json(context);
      } catch (error) {
        logger.error("business.context.upsert.failed", { error });
        return res.status(500).json({ message: "Failed to save business context" });
      }
    });
    
    app.get("/businesses/:businessId/context", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ message: "Invalid businessId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }
    
        const context = await sql.getBusinessContext(businessId);
        if (!context) {
          return res.status(404).json({ message: "Business context not found" });
        }
    
        logger.info("business.context.fetch.succeeded", {
          userId: authReq.auth.userId,
          businessId
        });
    
        return res.status(200).json(context);
      } catch (error) {
        logger.error("business.context.fetch.failed", { error });
        return res.status(500).json({ message: "Failed to fetch business context" });
      }
    });

}

function isValidBusinessContextRequest(request: Partial<UpsertBusinessContextRequestDto> | undefined): request is UpsertBusinessContextRequestDto {
  return Boolean(
    request?.businessProfile?.name &&
    request.businessProfile.language &&
    request.businessProfile.tone &&
    request.serviceCatalog !== undefined &&
    request.conversationPolicy !== undefined
  );
}