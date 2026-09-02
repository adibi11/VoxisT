import { describe, expect, it, vi } from "vitest";
import { VoiceCallContextBuilder } from "../../src/Voice/Context/VoiceCallContextBuilder";

describe("VoiceCallContextBuilder", () => {
  it("loads fresh context through a business-scoped Case query", async () => {
    const prisma = {
      case: {
        findFirst: vi.fn().mockResolvedValue({
          id: 20,
          business: { businessName: "Voxis Finance" },
          lead: { name: "Dana Lead", client: { name: "Dana Client" } },
          assignee: { displayName: "Alex LO" },
          documentSpecifications: [
            { id: 1, required: true, label: "Payslip", schema: { name: "Payslip", documentType: { name: "Payslip" } }, documents: [] },
            { id: 2, required: true, label: "Bank statement", schema: { name: "Bank", documentType: { name: "Statement" } }, documents: [{ status: "EXTRACTED", createdAt: new Date("2026-08-20T00:00:00Z") }] }
          ]
        })
      }
    };
    const portal = { getOrCreateActiveAccess: vi.fn().mockResolvedValue({ portalUrl: "https://portal/c/token" }) };
    const builder = new VoiceCallContextBuilder(prisma as any, portal as any);

    await expect(builder.build({ businessId: 7, caseId: 20 })).resolves.toEqual({
      caseId: 20,
      businessName: "Voxis Finance",
      borrowerName: "Dana Client",
      advisorName: "Alex LO",
      missingDocuments: [{ label: "Payslip" }],
      receivedDocuments: [{ label: "Bank statement" }],
      uploadUrl: "https://portal/c/token"
    });
    expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 20, businessId: 7 }
    }));
    expect(portal.getOrCreateActiveAccess).toHaveBeenCalledWith(7, 20);
  });

  it("does not create portal access for a cross-tenant Case lookup", async () => {
    const prisma = { case: { findFirst: vi.fn().mockResolvedValue(null) } };
    const portal = { getOrCreateActiveAccess: vi.fn() };
    const builder = new VoiceCallContextBuilder(prisma as any, portal as any);

    await expect(builder.build({ businessId: 8, caseId: 20 })).resolves.toBeNull();
    expect(portal.getOrCreateActiveAccess).not.toHaveBeenCalled();
  });
});
