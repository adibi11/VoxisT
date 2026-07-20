import { createHash, createHmac, timingSafeEqual } from "crypto";
import { Request, Response } from "express";
import { IDatabaseClient } from "../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../logging/logger";
import { getMetaWebhookConfig } from "./metaLeadAdsConfig";

type MetaLeadgenChange = { field?: unknown; value?: { leadgen_id?: unknown; form_id?: unknown; page_id?: unknown } };
type MetaWebhookBody = { entry?: Array<{ id?: unknown; changes?: MetaLeadgenChange[] }> };

export function createMetaLeadAdsWebhookHandlers(sql: IDatabaseClient, logger: ILogger) {
    return {
        verify: (req: Request, res: Response) => {
            const config = getMetaWebhookConfig();
            if (!config) return res.status(503).json({ message: "Meta lead ads webhook is not configured" });
            const mode = stringValue(req.query["hub.mode"]);
            const token = stringValue(req.query["hub.verify_token"]);
            const challenge = stringValue(req.query["hub.challenge"]);
            if (mode !== "subscribe" || !token || !challenge || !safeEquals(token, config.webhookVerifyToken)) {
                return res.status(403).send("Forbidden");
            }
            return res.status(200).type("text/plain").send(challenge);
        },
        receive: async (req: Request, res: Response) => {
            const config = getMetaWebhookConfig();
            if (!config) return res.status(503).json({ message: "Meta lead ads webhook is not configured" });
            const rawBody = req.body;
            if (!Buffer.isBuffer(rawBody) || !isValidMetaSignature(req.header("x-hub-signature-256"), rawBody, config.appSecret)) {
                return res.status(401).json({ message: "Invalid Meta webhook signature" });
            }

            let body: MetaWebhookBody;
            try { body = JSON.parse(rawBody.toString("utf8")) as MetaWebhookBody; }
            catch { return res.status(400).json({ message: "Invalid Meta webhook body" }); }

            let recorded = 0;
            for (const item of leadgenChanges(body)) {
                const connection = await sql.integrationConnectionRepository.getMetaConnectionByResource(item.formId, item.pageId);
                if (!connection) {
                    logger.warn("metaLeadAds.webhook.unresolved", { pageId: item.pageId, formId: item.formId, leadgenId: item.leadgenId });
                    continue;
                }
                const result = await sql.providerWebhookEventRepository.record({
                    businessId: connection.businessId,
                    integrationConnectionId: connection.id,
                    provider: "meta",
                    eventType: "leadgen",
                    providerEventId: `leadgen:${item.leadgenId}`,
                    payloadHash: createHash("sha256").update(rawBody).digest("hex"),
                    payload: { leadgen: item, raw: body }
                });
                if (result.outcome === "recorded") recorded++;
            }
            logger.info("metaLeadAds.webhook.accepted", { recorded });
            return res.status(200).json({ received: true });
        }
    };
}

function leadgenChanges(body: MetaWebhookBody): Array<{ pageId: string; formId: string; leadgenId: string }> {
    const result: Array<{ pageId: string; formId: string; leadgenId: string }> = [];
    for (const entry of body.entry || []) for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;
        const pageId = stringValue(change.value?.page_id) || stringValue(entry.id);
        const formId = stringValue(change.value?.form_id);
        const leadgenId = stringValue(change.value?.leadgen_id);
        if (pageId && formId && leadgenId) result.push({ pageId, formId, leadgenId });
    }
    return result;
}

function isValidMetaSignature(signature: string | undefined, rawBody: Buffer, appSecret: string): boolean {
    if (!signature?.startsWith("sha256=")) return false;
    const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    return safeEquals(signature, expected);
}

function safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left); const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
