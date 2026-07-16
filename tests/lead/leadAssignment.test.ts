import { describe, expect, it } from "vitest";
import { LeadRepository } from "../../src/dataClients/SqlClient/Repositories/LeadRepo/LeadRepository";

function createLead(memberId: number | null = null) {
  return {
    id: 1,
    businessId: 7,
    clientId: 3,
    memberId,
    status: "NEW",
    source: "WHATSAPP",
    score: null,
    summary: null,
    notes: null,
    name: "Lead",
    phoneNumber: "+972500000000",
    createdAt: new Date(),
    updatedAt: new Date(),
    asignTime: null,
    followUpAt: null,
    closedAt: null
  };
}

describe("LeadRepository atomic assignment", () => {
  it("allows only one concurrent claim of an unassigned lead", async () => {
    const lead = createLead();
    const prisma = {
      lead: {
        updateMany: async ({ where, data }: any) => {
          if (lead.id !== where.id || lead.businessId !== where.businessId || lead.memberId !== where.memberId) {
            return { count: 0 };
          }
          lead.memberId = data.memberId;
          lead.asignTime = data.asignTime;
          return { count: 1 };
        },
        findFirst: async () => lead
      }
    };
    const repository = new LeadRepository(prisma as any);

    const results = await Promise.all([
      repository.compareAndSetAssignee(7, 1, null, 10),
      repository.compareAndSetAssignee(7, 1, null, 11)
    ]);

    expect(results.filter((result) => result.outcome === "updated")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "conflict")).toHaveLength(1);
    expect([10, 11]).toContain(lead.memberId);
  });

  it("rejects an assignment based on a stale expected member", async () => {
    const lead = createLead(12);
    const prisma = {
      lead: {
        updateMany: async ({ where }: any) => ({ count: lead.memberId === where.memberId ? 1 : 0 }),
        findFirst: async () => lead
      }
    };
    const repository = new LeadRepository(prisma as any);

    const result = await repository.compareAndSetAssignee(7, 1, 10, 11);

    expect(result.outcome).toBe("conflict");
    expect(result.outcome === "conflict" && result.lead.memberId).toBe(12);
  });
});
