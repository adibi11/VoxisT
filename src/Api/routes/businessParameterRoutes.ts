import express from "express";
import { BusinessParameterTypeDto, UpsertBusinessParameterRequestDto } from "../../contracts";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessOwner } from "../authMiddleware";

const PARAMETER_TYPES = new Set<BusinessParameterTypeDto>(["CATEGORICAL", "CONTINUOUS", "TIME", "TEXT"]);

export function getBusinessParameterRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger) {
  app.post("/businesses/:businessId/parameters", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = Number(req.params.businessId);
      if (!Number.isInteger(businessId) || businessId <= 0) {
        return res.status(400).json({ message: "Invalid businessId" });
      }
      if (!requireBusinessOwner(authReq, res, businessId)) return;

      
      const request = req.body as Partial<UpsertBusinessParameterRequestDto>;
      if (!isValidRequest(request)) {
        return res.status(400).json({ message: "Invalid business parameter request" });
      }

      const parameter = await sql.businessParameterRepository.UpsertParameterByBusinessId(businessId, request);
      logger.info("business.parameter.upsert.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        parameterId: parameter.id
      });
      return res.status(request.id === undefined ? 201 : 200).json(parameter);
    } catch (error) {
      logger.error("business.parameter.upsert.failed", { error });
      const message = error instanceof Error ? error.message : "Failed to upsert business parameter";
      return res.status(400).json({ message });
    }
  });
}

function isValidRequest(request: Partial<UpsertBusinessParameterRequestDto> | undefined): request is UpsertBusinessParameterRequestDto {
  if (!request || typeof request !== "object" || !hasText(request.paramName)) return false;
  if (request.id !== undefined && (!Number.isInteger(request.id) || request.id <= 0)) return false;
  if (request.use !== undefined && typeof request.use !== "boolean") return false;
  if (request.paramType !== undefined && !PARAMETER_TYPES.has(request.paramType)) return false;
  if (request.config === undefined || request.config === null) return true;
  if (typeof request.config !== "object" || Array.isArray(request.config)) return false;

  const config = request.config;
  return (config.options === undefined ||
      (Array.isArray(config.options) && config.options.every(hasText))) &&
    (config.min === undefined || Number.isFinite(config.min)) &&
    (config.max === undefined || Number.isFinite(config.max)) &&
    (config.unit === undefined || typeof config.unit === "string");
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
