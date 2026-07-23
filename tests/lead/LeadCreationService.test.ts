import { describe, expect, it } from "vitest";
import { LeadCreationService } from "../../src/Lead/LeadCreationService";

describe("LeadCreationService", () => {
  it("creates a manual lead and exactly one pending lead event in the same transaction", async () => {
    const events: any[] = [];
    const leadCreates: any[] = [];
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
      client: { findUnique: async () => ({ id: 9, name: "Ada", phoneNumber: "+15550001" }) },
      lead: { create: async ({ data }: any) => { leadCreates.push(data); return { id: 31, businessId: data.businessId, ...data }; } },
      businessActivityEvent: { create: async ({ data }: any) => { events.push(data); return data; } }
    };

    await new LeadCreationService(prisma as any).createManualLead(7, {
      clientId: 9, name: "Ada", status: "NEW", source: "MANUAL"
    });

    expect(leadCreates).toHaveLength(1);
    expect(events).toEqual([expect.objectContaining({
      businessId: 7, aggregateType: "LEAD", aggregateId: 31, eventType: "LEAD_CREATED", dedupeKey: "lead:31:created"
    })]);
    expect(events[0]).not.toHaveProperty("state");
  });
});
