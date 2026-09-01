import "dotenv/config";
import cors from "cors";
import express from "express";
import version from "../../versions/api.json";
import { SqlManager } from "../dataClients/SqlClient/SqlManager";
import { logger } from "../logging/logger";
import { getAuthRoutes } from "./routes/authRoutes";
import { getBusinessRoutes } from "./routes/businessRoutes";
import { getCaseRoutes } from "./routes/caseRoutes";
import { getDocumentBundleRoutes } from "./routes/documentBundleRoutes";
import { getDocumentRoutes } from "./routes/documentRoutes";
import { getIntegrationRoutes } from "./routes/integrationRoutes";
import { getLeadIngestionRoutes } from "./routes/leadIngestionRoutes";
import { getLeadRoutes } from "./routes/leadRoutes";
import { getPortalRoutes } from "./routes/portalRoutes";
import { createPublicEntrypointRateLimiter, getPublicEntrypointRateLimitConfig } from "./rateLimitMiddleware";
import { createBodyParserErrorHandler, createSecurityHeaders, getHttpSecurityConfig } from "./securityMiddleware";

const appLogger = logger.child({ component: "ApiServer" });
const sqlManager = new SqlManager(logger.child({ component: "SqlManager" }));
const app = express();
const v1Router = express.Router();
const PORT = 3000;
const API_VERSION = version.version || "1.0.0";
const httpSecurityConfig = getHttpSecurityConfig();
const publicRateLimitConfig = getPublicEntrypointRateLimitConfig();
const publicRateLimiter = createPublicEntrypointRateLimiter(publicRateLimitConfig, appLogger);

app.set("trust proxy", httpSecurityConfig.trustProxyHops);

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || getAllowedOrigins().includes(origin)) return callback(null, true);
    return callback(new Error(`CORS origin denied: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-lead-capture-key", "X-Business-Id", "Idempotency-Key", "If-Match"],
  credentials: false,
  optionsSuccessStatus: 204
});

app.use(corsMiddleware);
app.options(/.*/, corsMiddleware);
app.use(createSecurityHeaders(httpSecurityConfig));
app.use(express.json({ limit: httpSecurityConfig.jsonBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: httpSecurityConfig.formBodyLimit }));

getAuthRoutes(v1Router, sqlManager, appLogger, publicRateLimiter);
getBusinessRoutes(v1Router, sqlManager, appLogger);
getLeadRoutes(v1Router, sqlManager, appLogger, publicRateLimiter);
getLeadIngestionRoutes(v1Router, sqlManager, appLogger, publicRateLimiter);
getIntegrationRoutes(v1Router, sqlManager, appLogger);
getDocumentBundleRoutes(v1Router, sqlManager, appLogger);
getCaseRoutes(v1Router, sqlManager, appLogger);
getDocumentRoutes(v1Router, sqlManager, appLogger);
getPortalRoutes(v1Router, sqlManager, appLogger, publicRateLimiter);

v1Router.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString(), version: API_VERSION });
});

app.use("/v1", v1Router);
app.get("/", (_req, res) => res.send("Server is running"));
app.use(createBodyParserErrorHandler(appLogger));

app.listen(PORT, () => {
  appLogger.info("server.started", {
    port: PORT,
    trustProxyHops: httpSecurityConfig.trustProxyHops,
    jsonBodyLimit: httpSecurityConfig.jsonBodyLimit,
    formBodyLimit: httpSecurityConfig.formBodyLimit,
    publicEntrypointRateLimitMax: publicRateLimitConfig.maxRequests,
    publicEntrypointRateLimitWindowSeconds: publicRateLimitConfig.windowSeconds
  });
});

function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || "http://localhost:3003,http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:8081,https://voxistudio.com,https://www.voxistudio.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
