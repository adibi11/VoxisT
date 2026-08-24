import { describe, expect, it } from "vitest";
import { CaseFollowUpMessageBuilder } from "../../src/CaseFollowUp/CaseFollowUpMessageBuilder";

describe("CaseFollowUpMessageBuilder", () => {
  it("builds concise deterministic Hebrew copy from safe labels", () => {
    const body = new CaseFollowUpMessageBuilder().build({
      clientName: "דנה",
      businessName: "Voxis Finance",
      portalUrl: "https://portal.example/c/opaque-token",
      missingRequirements: [
        { specificationId: 101, label: "תלוש שכר — מאי" },
        { specificationId: 102, label: "תלוש שכר — יוני" }
      ]
    });

    expect(body).toContain("שלום דנה");
    expect(body).toContain("• תלוש שכר — מאי\n• תלוש שכר — יוני");
    expect(body).toContain("https://portal.example/c/opaque-token");
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
      missingRequirements: []
    })).toThrow("missing requirements");
  });
});
