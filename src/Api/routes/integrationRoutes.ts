import { createHash, randomBytes } from "crypto";
import express from "express";
import { decryptMetaCredentials, encryptMetaCredentials, exchangeMetaCode, createMetaOAuthState, metaAuthorizeUrl, verifyMetaOAuthState, createMetaAuthorizationTicket, consumeMetaAuthorizationTicket } from "../../MetaLeadAds/metaOAuthService";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger, logger } from "../../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess, requireBusinessOwner } from "../authMiddleware";
import { encryptIntegrationSecret } from "../../LeadIngestion/integrationSecret";

type CreateIntegrationRequest =
    | { provider: "meta"; integrationType: "LEAD_ADS"; displayName?: string }
    | { provider: "landing_page"; integrationType: "LANDING_PAGE"; displayName?: string; formName?: string };

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
        //Meta Lead Ads integration is created in PENDING state and requires authorization flow to be completed before it can be used.
        if (body.provider === "meta" && body.integrationType === "LEAD_ADS") {
            const connection = await sql.integrationConnectionRepository.create({ businessId, provider: "meta", integrationType: "LEAD_ADS", status: "PENDING", connectionToken: randomBytes(32).toString("base64url"), displayName: body.displayName?.trim() || "Meta Lead Ads", externalAccountId: null, externalResourceId: null, config: { authorizationStatus: "NOT_STARTED" } });
            return res.status(201).json(connection);
        }
        if (body.provider !== "landing_page" || body.integrationType !== "LANDING_PAGE")
            return res.status(400).json({ message: "Only Meta Lead Ads and landing page connections are currently supported" });
        // Landing page integration is created in ACTIVE state and returns a one-time integration secret for server-to-server authentication.
        try {
            const connectionToken = randomBytes(32).toString("base64url");
            const integrationSecret = randomBytes(32).toString("base64url");
            const connection = await sql.integrationConnectionRepository.create({
                businessId, provider: "landing_page", integrationType: "LANDING_PAGE", status: "ACTIVE", connectionToken,
                webhookSecretEncrypted: encryptIntegrationSecret(integrationSecret), displayName: body.displayName?.trim() || "Landing page form",
                externalAccountId: null, externalResourceId: null, config: { formName: body.formName?.trim() || null }
            });
            return res.status(201).json({
                connection,
                integrationSecret,
                submissionEndpoint: `/v1/lead-submissions/${connectionToken}`,
                contract: landingPageSubmissionContract()
            });
        } catch (error) {
            logger.error("landingPage.connection.create.failed", { businessId, error });
            return res.status(503).json({ message: "Landing page integration could not be created" });
        }
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
            //The redis state is stored in the state parameter and is verified here to ensure the request is valid and not a CSRF attack.
            const state = verifyMetaOAuthState(stateText);
            const connection = await sql.integrationConnectionRepository.getById(state.businessId, state.connectionId);
            //The integration was created earlier in the initial request
            if (!connection || connection.provider !== "meta" || connection.status !== "PENDING") 
                throw new Error("Meta integration connection is unavailable");
            if (typeof req.query.error === "string") 
                throw new Error("Meta authorization was denied");
            const code = typeof req.query.code === "string" ? req.query.code : ""; 
            if (!code) 
                throw new Error("Meta authorization code is missing");
            // The code is exchanged for a long-lived page access token and stored in the integration connection's credentials.
            await sql.integrationConnectionRepository.saveCredentials(state.businessId, state.connectionId, encryptMetaCredentials(await exchangeMetaCode(code)));
            // TEMP_META_DEBUG: no OAuth code or access token is logged.
            logger.info("meta.debug.oauth.credentialsStored", { businessId: state.businessId, connectionId: state.connectionId });
            return res.redirect(302, frontendRedirect(state.connectionId, true));
        } catch (error) { logger.warn("meta.callback.failed", { error }); return res.redirect(302, frontendRedirect(undefined, false)); }
    });

    app.get("/businesses/:businessId/integrations/:connectionId/meta/resources", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); 
        const connectionId = parseId(req.params.connectionId); 
        if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) 
            return;
        try {
            logger.info("meta.debug.resources.requested", { businessId, connectionId });
            const resources = await discoverMetaResources(await requiredMetaConnection(sql, businessId, connectionId), logger, { businessId, connectionId });
            const subscriptions = await sql.metaLeadFormSubscriptionRepository.listByConnection(connectionId);
            logger.info("meta.debug.resources.returned", { businessId, connectionId, pageCount: resources.pages.length, formCount: resources.pages.reduce((total, page) => total + page.forms.length, 0), warningCount: resources.warnings.length, activeSubscriptionCount: subscriptions.filter((item) => item.status === "ACTIVE").length });
            const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId);
            
            return res.json({ pages: resources.pages.map(({ accessToken, ...page }) => page), warnings: resources.warnings, subscriptions });
        }
        catch (error) {
            const metaError = metaGraphDiagnostic(error);
            logger.error("meta.resources.failed", { businessId, connectionId, metaError, error });
            return res.status(error instanceof MetaGraphApiError ? 502 : 400).json({ message: "Unable to discover Meta Pages", metaError });
        }
    });

    app.get("/businesses/:businessId/integrations/:connectionId/meta/subscriptions", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId);
        if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId);
        if (!connection || connection.provider !== "meta") return res.status(404).json({ message: "Meta integration connection not found" });
        return res.json({ items: await sql.metaLeadFormSubscriptionRepository.listByConnection(connectionId) });
    });

    app.post("/businesses/:businessId/integrations/:connectionId/meta/subscriptions", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId); 
        if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        const pageId = typeof req.body?.pageId === "string" ? req.body.pageId : ""; 
        const formId = typeof req.body?.formId === "string" ? req.body.formId : "";
        try {
            logger.info("meta.debug.subscription.requested", { businessId, connectionId, page: debugFingerprint(pageId), form: debugFingerprint(formId) });
            const subscription = await addMetaFormSubscription(sql, businessId, connectionId, pageId, formId, logger);
            logger.info("meta.debug.subscription.saved", { businessId, connectionId, subscriptionId: subscription.id, page: debugFingerprint(subscription.pageId), form: debugFingerprint(subscription.formId) });
            return res.status(201).json(subscription);
        } catch (error) { logger.error("meta.resource.configure.failed", { businessId, connectionId, error }); return res.status(400).json({ message: "Unable to configure Meta Page/form" }); }
    });

    // Legacy single-resource endpoint. Kept for older clients; it now adds a form subscription.
    app.post("/businesses/:businessId/integrations/:connectionId/meta/resource", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId);
        if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        try { 
            return res.json(await addMetaFormSubscription(sql, businessId, connectionId, String(req.body?.pageId || ""), String(req.body?.formId || ""), logger)); }
        catch (error) { logger.error("meta.resource.configure.failed", { businessId, connectionId, error }); return res.status(400).json({ message: "Unable to configure Meta Page/form" }); }
    });

    app.delete("/businesses/:businessId/integrations/:connectionId/meta/subscriptions/:subscriptionId", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); 
        const connectionId = parseId(req.params.connectionId); 
        const subscriptionId = parseId(req.params.subscriptionId);
        if (!businessId || !connectionId || !subscriptionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        try {
            const existing = (await sql.metaLeadFormSubscriptionRepository.listByConnection(connectionId)).find((item) => item.id === subscriptionId);
            if (!existing || existing.status !== "ACTIVE") 
                return res.status(404).json({ message: "Meta form subscription not found" });
            if (await sql.metaLeadFormSubscriptionRepository.countActiveByPage(connectionId, existing.pageId) === 1) 
                await changeMetaPageSubscription(existing.pageId, await pageToken(sql, businessId, connectionId, existing.pageId), false);
                
            const removed = await sql.metaLeadFormSubscriptionRepository.disable(subscriptionId, connectionId);
            if (!removed) 
                return res.status(404).json({ message: "Meta form subscription not found" });
            return res.status(204).send();
        } catch (error) { logger.error("meta.subscription.remove.failed", { businessId, connectionId, subscriptionId, error }); return res.status(502).json({ message: "Unable to remove Meta form subscription" }); }
    });

    app.post("/businesses/:businessId/integrations/:connectionId/meta/verification", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId); if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId);
        if (!connection?.hasCredentials || !(await sql.metaLeadFormSubscriptionRepository.listByConnection(connectionId)).some((item) => item.status === "ACTIVE")) 
            return res.status(400).json({ message: "Authorize Meta and select a Page/form before verification" });
        return res.json({ connectionId, status: connection.status, verificationStatus: "AWAITING_TEST_LEAD", testLeadUrl: "https://developers.facebook.com/tools/lead-ads-testing" });
    });


    app.post("/businesses/:businessId/integrations/:connectionId/disable", requireAuth, async (req, res) => {
        const businessId = parseId(req.params.businessId); const connectionId = parseId(req.params.connectionId); 
        if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
        try {
            const subscriptions = (await sql.metaLeadFormSubscriptionRepository.listByConnection(connectionId)).filter((item) => item.status === "ACTIVE");
            for (const pageId of [...new Set(subscriptions.map((item) => item.pageId))]) await changeMetaPageSubscription(pageId, await pageToken(sql, businessId, connectionId, pageId), false);
            await sql.metaLeadFormSubscriptionRepository.disableAll(connectionId);
            await sql.integrationConnectionRepository.clearCredentials(businessId, connectionId);
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

async function addMetaFormSubscription(sql: IDatabaseClient, businessId: number, connectionId: number, pageId: string, formId: string, logger?: ILogger) {
    if (!pageId || !formId) throw new Error("Meta Page and form are required");
    const alreadyConnected = await sql.metaLeadFormSubscriptionRepository.getActiveByPageAndForm(pageId, formId);
    if (alreadyConnected && alreadyConnected.integrationConnectionId !== connectionId) 
        throw new Error("This Meta form is already connected to another Voxis business");
    const connection = await requiredMetaConnection(sql, businessId, connectionId);
    const resources = await discoverMetaResources(connection, logger, { businessId, connectionId });
    const page = resources.pages.find((item) => item.id === pageId);
    const form = page?.forms.find((item) => item.id === formId);
    if (!page || !form) {
        logger?.warn("meta.debug.subscription.notDiscoverable", { businessId, connectionId, requestedPage: debugFingerprint(pageId), requestedForm: debugFingerprint(formId), discoveredPageCount: resources.pages.length });
        throw new Error("Selected Meta Page/form is not authorized");
    }
    const activeOnPage = await sql.metaLeadFormSubscriptionRepository.countActiveByPage(connectionId, pageId);
    if (activeOnPage === 0) await changeMetaPageSubscription(pageId, page.accessToken, true);

    logger?.info("meta.subscription.start", {
        pageId,
        formId,
        pageName: page.name,
        formName: form.name,
    });
    logger?.info("meta.subscription.completed", {
        pageId,
        formId,
    });
    const credentials = decryptMetaCredentials(connection.credentialsEncrypted);
    credentials.pageAccessTokens = { ...(credentials.pageAccessTokens || {}), [pageId]: page.accessToken };
    // Preserve this field while existing connections and code are migrated.
    credentials.pageAccessToken = page.accessToken;
    await sql.integrationConnectionRepository.saveCredentials(businessId, connectionId, encryptMetaCredentials(credentials));
    await sql.integrationConnectionRepository.updateStatus(businessId, connectionId, "ACTIVE");
    return sql.metaLeadFormSubscriptionRepository.upsert({ integrationConnectionId: connectionId, pageId, pageName: page.name, formId, formName: form.name });
}

async function pageToken(sql: IDatabaseClient, businessId: number, connectionId: number, pageId: string): Promise<string> {
    const encrypted = await sql.integrationConnectionRepository.getCredentialsEncrypted(businessId, connectionId);
    if (!encrypted) throw new Error("Meta Page access token is unavailable");
    const credentials = decryptMetaCredentials(encrypted);
    const token = credentials.pageAccessTokens?.[pageId] || credentials.pageAccessToken;
    if (!token) throw new Error("Meta Page access token is unavailable");
    return token;
}

async function changeMetaPageSubscription(pageId: string, token: string, subscribe: boolean): Promise<void> {
    const version = process.env.META_GRAPH_API_VERSION?.trim();
    if (!version) throw new Error("META_GRAPH_API_VERSION is not configured");
    const url = new URL(`https://graph.facebook.com/${version}/${pageId}/subscribed_apps`);
    url.searchParams.set("access_token", token);
    if (subscribe) url.searchParams.set("subscribed_fields", "leadgen");
    const response = await fetch(url, { method: subscribe ? "POST" : "DELETE" });
        logger?.info("meta.subscription.graphResponse", {
        pageId,
        subscribe,
        status: response.status,
        
    });



    
    if (!response.ok) throw new Error(`Meta Page webhook ${subscribe ? "subscription" : "unsubscription"} failed (${response.status})`);
    
}   

type MetaResource = { id: string; name: string; accessToken: string; forms: Array<{ id: string; name: string }> };
type MetaResourceWarning = { pageId: string; pageName: string; message: string; status?: number; code?: number; fbTraceId?: string };

async function discoverMetaResources(connection: { credentialsEncrypted: string }, logger?: ILogger, context?: { businessId: number; connectionId: number }): Promise<{ pages: MetaResource[]; warnings: MetaResourceWarning[] }> {
    const credentials = decryptMetaCredentials(connection.credentialsEncrypted); 
    const version = process.env.META_GRAPH_API_VERSION!;
    // A failure here means the user token itself cannot discover Pages, so it is a real integration error.
    logger?.info("meta.debug.discovery.accounts.requested", context || {});
    const pages = await graphGet(version, "me/accounts", credentials.accessToken, "id,name,access_token") ;
    logger?.info("meta.debug.discovery.foram.pages",pages);
    logger?.info("meta.debug.discovery.accounts.succeeded", { ...context, pageCount: Array.isArray(pages.data) ? pages.data.length : 0, pages: Array.isArray(pages.data) ? pages.data.map((page: any) => debugFingerprint(String(page.id))).slice(0, 20) : [] });
    const results = await Promise.all((pages.data || []).map(async (page: any): Promise<{ page: MetaResource; warning?: MetaResourceWarning }> => {
        const pageId = String(page.id); 
        const pageName = String(page.name || page.id); 
        const accessToken = String(page.access_token);
        try {

            const forms = await graphGet(version, `${pageId}/leadgen_forms`, accessToken, "id,name");
            logger?.info("meta.debug.discovery.forms.succeeded", { ...context, page: debugFingerprint(pageId), formCount: Array.isArray(forms.data) ? forms.data.length : 0, forms: Array.isArray(forms.data) ? forms.data.map((form: any) => debugFingerprint(String(form.id))).slice(0, 20) : [] });
            
            return { page: { id: pageId, name: pageName, accessToken, forms: (forms.data || []).map((form: any) => (
                { id: String(form.id), name: String(form.name || form.id) })) } };
        } catch (error) {
            // A Page may legitimately have no forms, or Meta may deny form access for this Page.
            // Preserve every discoverable Page so the UI can explain the issue without blocking setup.
            const diagnostic = metaGraphDiagnostic(error);
            logger?.warn("meta.debug.discovery.forms.failed", { ...context, page: debugFingerprint(pageId), status: diagnostic.status, code: diagnostic.code, fbTraceId: diagnostic.fbTraceId, message: diagnostic.message });
            return {
                page: { id: pageId, name: pageName, accessToken, forms: [] },
                warning: { pageId, pageName, message: diagnostic.message, status: diagnostic.status, code: diagnostic.code, fbTraceId: diagnostic.fbTraceId }
            };
        }
    }));
    return { pages: results.map((result) => result.page), warnings: results.flatMap((result) => result.warning ? [result.warning] : []) };
}
async function graphGet(version: string, path: string, token: string, fields: string): Promise<any> 
{ 
    const url = new URL(`https://graph.facebook.com/${version}/${path}`); 
    url.searchParams.set("access_token", token); url.searchParams.set("fields", fields); 
    const response = await fetch(url);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const error = payload && typeof payload === "object" ? (payload as { error?: Record<string, unknown> }).error : undefined;
        throw new MetaGraphApiError(path, response.status, {
            code: typeof error?.code === "number" ? error.code : undefined,
            message: typeof error?.message === "string" ? error.message : "Meta Graph API request failed",
            fbTraceId: typeof error?.fbtrace_id === "string" ? error.fbtrace_id : undefined
        });
    }
    return payload;
}

class MetaGraphApiError extends Error {
    constructor(readonly path: string, readonly status: number, readonly details: { code?: number; message: string; fbTraceId?: string }) {
        super(details.message); this.name = "MetaGraphApiError";
    }
}

function metaGraphDiagnostic(error: unknown): { path?: string; status?: number; code?: number; message: string; fbTraceId?: string } {
    if (error instanceof MetaGraphApiError) return { path: error.path, status: error.status, code: error.details.code, message: error.details.message, fbTraceId: error.details.fbTraceId };
    return { message: error instanceof Error ? error.message : "Meta resource discovery failed" };
}
// TEMP_META_DEBUG: fingerprints correlate events without exposing Meta resource names, IDs, credentials, or tokens.
function debugFingerprint(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 12); }
function frontendRedirect(connectionId: number | undefined, success: boolean): string {
     const base = process.env.META_OAUTH_FRONTEND_REDIRECT?.trim() || "https://voxistudio.com/settings/integrations/meta"; 
     const url = new URL(base); if (connectionId) url.searchParams.set("connectionId", String(connectionId)); 
     url.searchParams.set("authorized", String(success)); 
     return url.toString(); }
function parseId(value: unknown): number | null {
     const id = Number(value); 
     return Number.isInteger(id) && id > 0 ? id : null; 
    }

function landingPageSubmissionContract() {
    return {
        authentication: { header: "X-Voxis-Integration-Secret", note: "Store this secret only in the landing page server or serverless function. It is returned once when the connection is created." },
        required: ["externalEventId", "person (at least one of fullName, firstName, lastName, email, or phone)"],
        optional: ["answers.fields", "attribution", "consent", "metadata"],
        example: {
            externalEventId: "submission_123", person: { fullName: "Jane Doe", email: "jane@example.com", phone: "+972501234567" },
            answers: { fields: [{ key: "service", label: "Requested service", value: "Renovation", valueType: "choice" }] },
            attribution: { landingPageUrl: "https://client.example/quote", utm: { source: "google", campaign: "summer" } },
            consent: { contact: { granted: true, capturedAt: "2026-07-20T13:00:00.000Z", channels: ["phone", "email"] } }
        }
    };
}
