import { randomBytes } from "crypto";
import express from "express";
import { decryptMetaCredentials, encryptMetaCredentials, exchangeMetaCode, createMetaOAuthState, metaAuthorizeUrl, verifyMetaOAuthState, createMetaAuthorizationTicket, consumeMetaAuthorizationTicket } from "../../MetaLeadAds/metaOAuthService";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess, requireBusinessOwner } from "../authMiddleware";

type CreateIntegrationRequest = { provider: "meta"; integrationType: "LEAD_ADS"; displayName?: string };

export function getIntegrationRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger): void {
    app.get("/businesses/:businessId/integrations", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); if (!businessId || !requireBusinessAccess(req as AuthenticatedRequest, res, businessId)) return;
        return res.json({ items: await sql.integrationConnectionRepository.listByBusiness(businessId) });
    });

    app.post("/businesses/:businessId/integrations", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId);
        if (!businessId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) 
            return;
        const body = req.body as Partial<CreateIntegrationRequest>;
        if (body.provider !== "meta" || body.integrationType !== "LEAD_ADS") 
            return res.status(400).json({ message: "Only Meta Lead Ads connections are currently supported" });
        const connection = await sql.integrationConnectionRepository.create({ businessId, provider: "meta", integrationType: "LEAD_ADS", status: "PENDING", connectionToken: randomBytes(32).toString("base64url"), displayName: body.displayName?.trim() || "Meta Lead Ads", externalAccountId: null, externalResourceId: null, config: { authorizationStatus: "NOT_STARTED" } });
        return res.status(201).json(connection);
    });

    app.get("/businesses/:businessId/integrations/:connectionId", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId); 
        if (!businessId || !connectionId || !requireBusinessAccess(req as AuthenticatedRequest, res, businessId)) 
            return;
        const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId);
        return connection ? res.json(connection) : res.status(404).json({ message: "Integration connection not found" });
    });

    app.post("/businesses/:businessId/integrations/:connectionId/meta/authorize-ticket", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId); if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId);
        if (!connection || connection.provider !== "meta" || connection.integrationType !== "LEAD_ADS" || connection.status !== "PENDING") return res.status(400).json({ message: "Meta Lead Ads connection is not eligible for authorization" });
        try { return res.status(201).json({ authorizationUrl: `/v1/integrations/meta/authorize?ticket=${encodeURIComponent(await createMetaAuthorizationTicket({ businessId, connectionId, ownerId: (req as AuthenticatedRequest).auth.userId }))}` }); }
        catch (error) { logger.error("meta.authorize.failed", { businessId, connectionId, error }); return res.status(503).json({ message: "Meta authorization is not configured" }); }
    });

    app.get("/integrations/meta/authorize", async (req, res) => {
        try {
            const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
            const scope = await consumeMetaAuthorizationTicket(ticket);
            const connection = await sql.integrationConnectionRepository.getById(scope.businessId, scope.connectionId);
            if (!connection || connection.provider !== "meta" || connection.integrationType !== "LEAD_ADS" || connection.status !== "PENDING") throw new Error("Meta integration connection is unavailable");
            return res.redirect(302, metaAuthorizeUrl(createMetaOAuthState(scope)));
        } catch (error) { logger.warn("meta.authorize.ticket.failed", { error }); return res.status(400).send("Meta authorization link is invalid or expired."); }
    });

    app.get("/integrations/oauth/meta/callback", async (req, res) => {
        const stateText = typeof req.query.state === "string" ? req.query.state : "";
        try {
            const state = verifyMetaOAuthState(stateText);
            const connection = await sql.integrationConnectionRepository.getById(state.businessId, state.connectionId);
            if (!connection || connection.provider !== "meta" || connection.status !== "PENDING") throw new Error("Meta integration connection is unavailable");
            if (typeof req.query.error === "string") throw new Error("Meta authorization was denied");
            const code = typeof req.query.code === "string" ? req.query.code : ""; if (!code) throw new Error("Meta authorization code is missing");
            await sql.integrationConnectionRepository.saveCredentials(state.businessId, state.connectionId, encryptMetaCredentials(await exchangeMetaCode(code)));
            return res.redirect(302, frontendRedirect(state.connectionId, true));
        } catch (error) { logger.warn("meta.callback.failed", { error }); return res.redirect(302, frontendRedirect(undefined, false)); }
    });

    app.get("/businesses/:businessId/integrations/:connectionId/meta/resources", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); 
        const connectionId = parseId(req.params.connectionId); 
        if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) 
            return;
        try { return res.json({ pages: await discoverMetaResources(await requiredMetaConnection(sql, businessId, connectionId)) }); }
        catch (error) { logger.error("meta.resources.failed", { businessId, connectionId, error }); return res.status(400).json({ message: "Unable to discover Meta Pages and forms" }); }
    });

    app.post("/businesses/:businessId/integrations/:connectionId/meta/resource", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId); if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        const pageId = typeof req.body?.pageId === "string" ? req.body.pageId : ""; const formId = typeof req.body?.formId === "string" ? req.body.formId : "";
        try {
            const connection = await requiredMetaConnection(sql, businessId, connectionId); const resources = await discoverMetaResources(connection);
            const page = resources.find((item) => item.id === pageId); 
            if (!page || !page.forms.some((form) => form.id === formId)) 
                return res.status(400).json({ message: "Selected Meta Page/form is not authorized" });
            const credentials = decryptMetaCredentials(connection.credentialsEncrypted); 
            credentials.pageAccessToken = page.accessToken;
            return res.json(await sql.integrationConnectionRepository.configureMetaResource(businessId, connectionId, pageId, formId, encryptMetaCredentials(credentials)));
        } catch (error) { logger.error("meta.resource.configure.failed", { businessId, connectionId, error }); return res.status(400).json({ message: "Unable to configure Meta Page/form" }); }
    });

    app.post("/businesses/:businessId/integrations/:connectionId/meta/verification", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId); if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId);
        if (!connection?.hasCredentials || !connection.externalResourceId) 
            return res.status(400).json({ message: "Authorize Meta and select a Page/form before verification" });
        return res.json({ connectionId, status: connection.status, verificationStatus: "AWAITING_TEST_LEAD", testLeadUrl: "https://developers.facebook.com/tools/lead-ads-testing" });
    });

    app.post("/businesses/:businessId/integrations/:connectionId/disable", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId); 
        if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        try { 
            return res.json(await sql.integrationConnectionRepository.updateStatus(businessId, connectionId, "DISABLED")); 
        }
        catch { return res.status(404).json({ message: "Integration connection not found" }); }
    });
}

async function requiredMetaConnection(sql: IDatabaseClient, businessId: number, connectionId: number) 
{ 
    const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId); 
    const credentialsEncrypted = await sql.integrationConnectionRepository.getCredentialsEncrypted(businessId, connectionId); 
    if (!connection || connection.provider !== "meta" || !credentialsEncrypted) 
        throw new Error("Meta authorization is required"); 
    return { ...connection, credentialsEncrypted }; 
}
async function discoverMetaResources(connection: { credentialsEncrypted: string }): Promise<Array<{ id: string; name: string; accessToken: string; forms: Array<{ id: string; name: string }> }>> {
    const credentials = decryptMetaCredentials(connection.credentialsEncrypted); const version = process.env.META_GRAPH_API_VERSION!;
    const pages = await graphGet(version, "me/accounts", credentials.accessToken, "id,name,access_token");
    return Promise.all((pages.data || []).map(async (page: any) => ({ id: String(page.id), name: String(page.name || page.id), accessToken: String(page.access_token), forms: (await graphGet(version, `${page.id}/leadgen_forms`, String(page.access_token), "id,name")).data?.map((form: any) => ({ id: String(form.id), name: String(form.name || form.id) })) || [] })));
}
async function graphGet(version: string, path: string, token: string, fields: string): Promise<any> 
{ 
    const url = new URL(`https://graph.facebook.com/${version}/${path}`); 
    url.searchParams.set("access_token", token); url.searchParams.set("fields", fields); 
    const response = await fetch(url); 
    if (!response.ok) 
        throw new Error("Meta Graph API request failed"); 
    return response.json(); }
function frontendRedirect(connectionId: number | undefined, success: boolean): string {
     const base = process.env.META_OAUTH_FRONTEND_REDIRECT?.trim() || "https://voxistudio.com/settings/integrations/meta"; 
     const url = new URL(base); if (connectionId) url.searchParams.set("connectionId", String(connectionId)); 
     url.searchParams.set("authorized", String(success)); 
     return url.toString(); }
function parseId(value: unknown): number | null {
     const id = Number(value); 
     return Number.isInteger(id) && id > 0 ? id : null; 
    }
