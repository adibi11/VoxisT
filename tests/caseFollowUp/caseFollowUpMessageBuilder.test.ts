import { describe, expect, it } from "vitest";
import { CaseFollowUpMessageBuilder } from "../../src/CaseFollowUp/CaseFollowUpMessageBuilder";

describe("CaseFollowUpMessageBuilder", () => {
  it("builds concise deterministic Hebrew copy from safe labels", () => {
    const body = new CaseFollowUpMessageBuilder().build({
      clientName: "דנה",
      businessName: "Voxis Finance",
      portalUrl: "https://portal.example/c/opaque-token",
      intakeEmailAddress: "case-abc123@docs.example.com",
      missingRequirements: [
        { specificationId: 101, label: "תלוש שכר — מאי" },
        { specificationId: 102, label: "תלוש שכר — יוני" }
      ]
    });

    expect(body).toContain("שלום דנה");
    expect(body).toContain("• תלוש שכר — מאי\n• תלוש שכר — יוני");
    expect(body).toContain("להעלאה דרך הפורטל:");
    expect(body).toContain("https://portal.example/c/opaque-token");
    expect(body).toContain("או שלחו את המסמכים כקבצים מצורפים למייל:");
    expect(body).toContain("case-abc123@docs.example.com");
    expect(body).toContain("Voxis Finance");
    expect(body).not.toContain("101");
    expect(body).not.toContain("102");
    expect(body).not.toMatch(/EXTRACTED|PROCESSING|schemaId|specificationId/);
  });

  it("rejects an empty missing-requirement list", () => {
    expect(() => new CaseFollowUpMessageBuilder().build({
      clientName: "Dana",
      businessName: "Voxis",
      portalUrl: "https://portal.example/c/token",
      intakeEmailAddress: "case-abc123@docs.example.com",
      missingRequirements: []
    })).toThrow("missing requirements");
  });

  it("requires the case inbound email address", () => {
    expect(() => new CaseFollowUpMessageBuilder().build({
      clientName: "Dana",
      businessName: "Voxis",
      portalUrl: "https://portal.example/c/token",
      intakeEmailAddress: " ",
      missingRequirements: [{ specificationId: 101, label: "Payslip" }]
    })).toThrow("Inbound email address");
  });
});
