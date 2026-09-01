import { describe, expect, it } from "vitest";
import { LeadRepository } from "../../src/dataClients/SqlClient/Repositories/LeadRepo/LeadRepository";

describe("Lead email storage", () => {
  it("normalizes email before persisting it", async () => {
    let createdLeadData: any;
    const now = new Date();
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
      client: {
        findUnique: async () => null,
        create: async ({ data }: any) => ({ id: 7, name: data.name || null, phoneNumber: data.phoneNumber })
      },
      lead: {
        create: async ({ data }: any) => {
          createdLeadData = data;
          return {
            id: 1,
            businessId: 2,
            clientId: 7,
            memberId: null,
            status: data.status,
            source: data.source,
            score: null,
            summary: null,
            notes: null,
            name: null,
            email: data.email || null,
            phoneNumber: data.phoneNumber,
            createdAt: now,
            updatedAt: now,
            asignTime: null,
            followUpAt: null,
            closedAt: null
          };
        }
      }
    };
    const repository = new LeadRepository(prisma as any);

    const lead = await repository.createManualLead(2, {
      phoneNumber: "+15550000000",
      email: "  Customer@Example.COM  "
    });

    expect(createdLeadData.email).toBe("customer@example.com");
    expect(lead.email).toBe("customer@example.com");
  });
});
