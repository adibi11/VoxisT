import { randomBytes } from "crypto";
import express from "express";
import { IDatabaseClient } from "../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessOwner } from "../Api/authMiddleware";
import { InstagramDiscoveryService } from "./InstagramDiscoveryService";
import { consumeInstagramAuthorizationTicket, createInstagramAuthorizationTicket, createInstagramState, decryptInstagramCredentials, encryptInstagramCredentials, exchangeInstagramCode, instagramAuthorizeUrl, verifyInstagramState } from "./instagramOAuthService";
import { getInstagramConfig } from "./instagramConfig";
import { InstagramRuleInput } from "./instagramTypes";

export function getInstagramCommentAutomationRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger): void {
  const discovery = new InstagramDiscoveryService(sql.instagramRepository);

  app.post("/businesses/:businessId/instagram-comment-automations/connections", requireAuth, async (req, res) => {
    const businessId = id(req.params.businessId); if (!businessId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
    const connection = await sql.integrationConnectionRepository.create({ businessId, provider: "instagram", integrationType: "INSTAGRAM_COMMENT_AUTOMATION", status: "PENDING", connectionToken: randomBytes(32).toString("base64url"), displayName: text(req.body?.displayName) || "Instagram comment automation", externalAccountId: null, externalResourceId: null, config: { authorizationStatus: "NOT_STARTED", loginType: "INSTAGRAM" } });
    return res.status(201).json(connection);
  });

  app.post("/businesses/:businessId/instagram-comment-automations/connections/:connectionId/authorize-ticket", requireAuth, async (req, res) => {
    const businessId = id(req.params.businessId); const connectionId = id(req.params.connectionId);
    if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
    const connection = await instagramConnection(sql, businessId, connectionId);
    if (!connection || connection.status === "DISABLED") return res.status(400).json({ message: "Instagram connection is not eligible for authorization" });
    try {
      const ticket = await createInstagramAuthorizationTicket({ businessId, connectionId, ownerId: (req as AuthenticatedRequest).auth.userId });
      return res.status(201).json({ authorizationUrl: `/v1/integrations/instagram-comments/authorize?ticket=${encodeURIComponent(ticket)}` });
    } catch (error) { logger.error("instagram.oauth.ticket.failed", { businessId, connectionId, error }); return res.status(503).json({ message: "Instagram authorization is not configured" }); }
  });

  app.get("/integrations/instagram-comments/authorize", async (req, res) => {
    try {
      const scope = await consumeInstagramAuthorizationTicket(text(req.query.ticket) || "");
      const connection = await instagramConnection(sql, scope.businessId, scope.connectionId);
      if (!connection || connection.status === "DISABLED") throw new Error("Instagram connection is unavailable");
      return res.redirect(302, instagramAuthorizeUrl(createInstagramState(scope)));
    } catch (error) { logger.warn("instagram.oauth.authorize.failed", { error }); return res.status(400).send("Instagram authorization link is invalid or expired."); }
  });

  app.get("/integrations/oauth/instagram-comments/callback", async (req, res) => {
    let connectionId: number | undefined;
    try {
      const state = verifyInstagramState(text(req.query.state) || ""); connectionId = state.connectionId;
      const connection = await instagramConnection(sql, state.businessId, state.connectionId);
      if (!connection || connection.status === "DISABLED") throw new Error("Instagram connection is unavailable");
      if (text(req.query.error)) throw new Error("Instagram authorization was denied");
      const code = text(req.query.code); if (!code) throw new Error("Instagram authorization code is missing");
      const credentials = await exchangeInstagramCode(code);
      await sql.integrationConnectionRepository.saveCredentials(state.businessId, state.connectionId, encryptInstagramCredentials(credentials));
      const result = await discovery.synchronize(state.connectionId, credentials);
      await sql.integrationConnectionRepository.updateStatus(state.businessId, state.connectionId, "ACTIVE");
      logger.info("instagram.oauth.completed", { businessId: state.businessId, connectionId: state.connectionId, mediaCount: result.mediaCount });
      return res.redirect(302, frontendRedirect(connectionId, true));
    } catch (error) { logger.warn("instagram.oauth.callback.failed", { connectionId, error }); return res.redirect(302, frontendRedirect(connectionId, false)); }
  });

  app.get("/businesses/:businessId/instagram-comment-automations/connections/:connectionId/account", requireAuth, async (req, res) => {
    const scoped = ownerScope(req, res); if (!scoped) return;
    const account = await sql.instagramRepository.getAccountByConnection(scoped.businessId, scoped.connectionId);
    return account ? res.json(account) : res.status(404).json({ message: "Instagram account has not been synchronized" });
  });

  app.post("/businesses/:businessId/instagram-comment-automations/connections/:connectionId/media/sync", requireAuth, async (req, res) => {
    const scoped = ownerScope(req, res); if (!scoped) return;
    try {
      const encrypted = await sql.integrationConnectionRepository.getCredentialsEncrypted(scoped.businessId, scoped.connectionId);
      if (!encrypted || !(await instagramConnection(sql, scoped.businessId, scoped.connectionId))) return res.status(400).json({ message: "Instagram authorization is required" });
      const result = await discovery.synchronize(scoped.connectionId, decryptInstagramCredentials(encrypted));
      return res.json({ account: result.account, mediaCount: result.mediaCount, items: await sql.instagramRepository.listMedia(scoped.businessId, scoped.connectionId) });
    } catch (error) { logger.error("instagram.media.sync.failed", { ...scoped, error }); return res.status(502).json({ message: "Unable to synchronize Instagram media" }); }
  });

  app.get("/businesses/:businessId/instagram-comment-automations/connections/:connectionId/media", requireAuth, async (req, res) => {
    const scoped = ownerScope(req, res); if (!scoped) return;
    return res.json({ items: await sql.instagramRepository.listMedia(scoped.businessId, scoped.connectionId) });
  });

  app.get("/businesses/:businessId/instagram-comment-automations/connections/:connectionId/rules", requireAuth, async (req, res) => {
    const scoped = ownerScope(req, res); if (!scoped) return;
    return res.json({ items: await sql.instagramRepository.listRules(scoped.businessId, scoped.connectionId) });
  });

  app.post("/businesses/:businessId/instagram-comment-automations/connections/:connectionId/rules", requireAuth, async (req, res) => {
    const scoped = ownerScope(req, res); if (!scoped) return;
    const input = ruleInput(req.body, false); if (!input.ok) return res.status(400).json({ message: input.message });
    try { return res.status(201).json(await sql.instagramRepository.createRule(scoped.businessId, scoped.connectionId, input.value)); }
    catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create rule" }); }
  });

  app.patch("/businesses/:businessId/instagram-comment-automations/connections/:connectionId/rules/:ruleId", requireAuth, async (req, res) => {
    const scoped = ownerScope(req, res); const ruleId = id(req.params.ruleId); if (!scoped || !ruleId) return;
    const input = ruleInput(req.body, true); if (!input.ok) return res.status(400).json({ message: input.message });
    try { const rule = await sql.instagramRepository.updateRule(scoped.businessId, scoped.connectionId, ruleId, input.value); return rule ? res.json(rule) : res.status(404).json({ message: "Instagram automation rule not found" }); }
    catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update rule" }); }
  });
}

async function instagramConnection(sql: IDatabaseClient, businessId: number, connectionId: number) { const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId); return connection?.provider === "instagram" && connection.integrationType === "INSTAGRAM_COMMENT_AUTOMATION" ? connection : null; }
function ownerScope(req: express.Request, res: express.Response): { businessId: number; connectionId: number } | null { const businessId = id(req.params.businessId); const connectionId = id(req.params.connectionId); if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return null; return { businessId, connectionId }; }
function frontendRedirect(connectionId: number | undefined, authorized: boolean): string { const url = new URL(getInstagramConfig().frontendRedirectUri); if (connectionId) url.searchParams.set("connectionId", String(connectionId)); url.searchParams.set("authorized", String(authorized)); return url.toString(); }
function id(value: unknown): number | null { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function ruleInput(body: any, partial: boolean): { ok: true; value: any } | { ok: false; message: string } {
  const value: Partial<InstagramRuleInput> = {};
  if (!partial || body.instagramMediaId !== undefined) { const mediaId = id(body.instagramMediaId); if (!mediaId) return { ok: false, message: "instagramMediaId is required" }; value.instagramMediaId = mediaId; }
  if (!partial || body.name !== undefined) { const name = text(body.name); if (!name) return { ok: false, message: "name is required" }; value.name = name; }
  if (!partial || body.keywords !== undefined) { if (!Array.isArray(body.keywords)) return { ok: false, message: "keywords must be an array" }; value.keywords = [...new Set(body.keywords.map(text).filter(Boolean))] as string[]; }
  if (!partial || body.matchType !== undefined) { if (!["ANY_KEYWORD", "ALL_KEYWORDS", "EXACT"].includes(body.matchType)) return { ok: false, message: "matchType is invalid" }; value.matchType = body.matchType; }
  if (body.publicReplyText !== undefined) value.publicReplyText = text(body.publicReplyText);
  if (!partial || body.privateReplyText !== undefined) { const message = text(body.privateReplyText); if (!message) return { ok: false, message: "privateReplyText is required" }; value.privateReplyText = message; }
  if (!partial || body.status !== undefined) { if (!["ENABLED", "DISABLED"].includes(body.status)) return { ok: false, message: "status is invalid" }; if (body.status === "ENABLED") return { ok: false, message: "Rules cannot be enabled until Instagram webhook delivery is deployed" }; value.status = "DISABLED"; }
  return { ok: true, value };
}