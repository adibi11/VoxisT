import { describe, expect, it } from "vitest";
import { LeadCreationService } from "../../src/Lead/LeadCreationService";

describe("LeadCreationService", () => {
  it("creates a manual lead without legacy business activity events", async () => {
    const leadCreates: any[] = [];
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
      client: { findUnique: async () => ({ id: 9, name: "Ada", phoneNumber: "+15550001" }) },
      lead: { create: async ({ data }: any) => { leadCreates.push(data); return { id: 31, businessId: data.businessId, ...data }; } }
    };

    await new LeadCreationService(prisma as any).createManualLead(7, {
      clientId: 9, name: "Ada", status: "NEW", source: "MANUAL"
    });

    expect(leadCreates).toHaveLength(1);
  });

  it("creates an integrated lead directly in the resolved tenant and records idempotency", async () => {
    const leadCreates: any[] = [];
    const externalCreates: any[] = [];
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
      externalLead: {
        findUnique: async () => null,
        create: async ({ data }: any) => { externalCreates.push(data); return { id: 44, ...data }; }
      },
      lead: { create: async ({ data }: any) => { leadCreates.push(data); return { id: 32, ...data }; } },
      leadAttribution: { create: async () => ({ id: 1 }) }
    };

    const result = await new LeadCreationService(prisma as any).createIntegratedLead({
      id: 3, businessId: 7, provider: "customer-website", integrationType: "FORM"
    }, {
      schemaVersion: 1,
      source: { provider: "customer-website", integrationType: "FORM", eventType: "public.form.submitted", externalEventId: "submission-1", receivedAt: "2026-09-01T10:00:00.000Z" },
      person: { fullName: "Ada Lovelace", email: "ADA@example.test", phone: "+15550001" },
      answers: { fields: [] }
    });

    expect(result).toEqual({ outcome: "created", leadId: 32, externalLeadId: 44 });
    expect(leadCreates[0]).toMatchObject({ businessId: 7, source: "WEBSITE", email: "ada@example.test" });
    expect(externalCreates[0]).toMatchObject({ businessId: 7, integrationConnectionId: 3, externalLeadId: "event:customer-website:submission-1" });
  });

  it("returns the existing lead for a duplicate integrated submission", async () => {
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
      externalLead: { findUnique: async () => ({ id: 44, leadId: 32 }) }
    };
    const result = await new LeadCreationService(prisma as any).createIntegratedLead({
      id: 3, businessId: 7, provider: "customer-website", integrationType: "FORM"
    }, {
      schemaVersion: 1,
      source: { provider: "customer-website", integrationType: "FORM", eventType: "public.form.submitted", externalEventId: "submission-1", receivedAt: "2026-09-01T10:00:00.000Z" },
      person: { phone: "+15550001" },
      answers: { fields: [] }
    });
    expect(result).toEqual({ outcome: "duplicate", leadId: 32, externalLeadId: 44 });
  });
});
