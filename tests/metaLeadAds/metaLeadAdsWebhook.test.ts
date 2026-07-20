import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { createMetaLeadAdsWebhookHandlers } from "../../src/MetaLeadAds/metaLeadAdsWebhook";
import { IDatabaseClient } from "../../src/dataClients/SqlClient/sqlInterface";

describe("Meta Lead Ads webhook", () => {
    it("accepts a correctly signed leadgen notification and records it against the resolved connection", async () => {
        process.env.META_APP_SECRET = "test-secret";
        process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-token";
        const sql = fakeSql();
        const handlers = createMetaLeadAdsWebhookHandlers(sql, silentLogger);
        const body = Buffer.from(JSON.stringify({ object: "page", entry: [{ id: "page-1", changes: [{ field: "leadgen", value: { page_id: "page-1", form_id: "form-1", leadgen_id: "lead-1" } }] }] }));
        const response = fakeResponse();

        await handlers.receive({ body, header: (name: string) => name === "x-hub-signature-256" ? `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}` : undefined } as any, response as any);

        expect(response.statusCode).toBe(200);
        expect(sql.recorded).toMatchObject({ businessId: 7, integrationConnectionId: 3, providerEventId: "leadgen:lead-1" });
    });

    it("returns the Meta challenge only when the configured verify token matches", () => {
        process.env.META_APP_SECRET = "test-secret";
        process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-token";
        const handlers = createMetaLeadAdsWebhookHandlers(fakeSql(), silentLogger);
        const response = fakeResponse();

        handlers.verify({ query: { "hub.mode": "subscribe", "hub.verify_token": "verify-token", "hub.challenge": "challenge" } } as any, response as any);

        expect(response.statusCode).toBe(200);
        expect(response.body).toBe("challenge");
    });
});

function fakeSql(): IDatabaseClient & { recorded?: unknown } {
    const sql: any = {
        integrationConnectionRepository: { getMetaConnectionByResource: async () => ({ id: 3, businessId: 7 }) },
        providerWebhookEventRepository: { record: async (input: unknown) => { sql.recorded = input; return { outcome: "recorded" }; } }
    };
    return sql;
}

const silentLogger: any = { info: () => undefined, warn: () => undefined, error: () => undefined, child: () => silentLogger };

function fakeResponse() {
    return {
        statusCode: 200, body: undefined as unknown,
        status(code: number) { this.statusCode = code; return this; },
        json(value: unknown) { this.body = value; return this; },
        send(value: unknown) { this.body = value; return this; },
        type() { return this; }
    };
}
