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
});
