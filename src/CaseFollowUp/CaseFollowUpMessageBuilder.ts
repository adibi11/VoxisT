import { MissingCaseRequirement } from "./caseFollowUpTypes";

export type CaseFollowUpMessageInput = {
  clientName: string;
  businessName: string;
  portalUrl: string;
  missingRequirements: MissingCaseRequirement[];
};

export class CaseFollowUpMessageBuilder {
  build(input: CaseFollowUpMessageInput): string {
    if (input.missingRequirements.length === 0) {
      throw new Error("Cannot build a Case follow-up without missing requirements");
    }

    const clientName = input.clientName.trim() || "לקוח/ה";
    const businessName = input.businessName.trim();
    if (!businessName) throw new Error("Business name is required");
    if (!input.portalUrl.trim()) throw new Error("Portal URL is required");

    const requirements = input.missingRequirements
      .map((requirement) => `• ${requirement.label}`)
      .join("\n");

    return [
      `שלום ${clientName},`,
      "",
      "עדיין חסרים לנו המסמכים הבאים:",
      "",
      requirements,
      "",
      "להעלאת המסמכים:",
      input.portalUrl,
      "",
      businessName
    ].join("\n");
  }
}
