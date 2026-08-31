import { MissingCaseRequirement } from "./caseFollowUpTypes";

export type CaseFollowUpMessageInput = {
  clientName: string;
  businessName: string;
  portalUrl: string;
  intakeEmailAddress: string;
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
    if (!input.intakeEmailAddress.trim()) throw new Error("Inbound email address is required");

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
      "להעלאה דרך הפורטל:",
      input.portalUrl,
      "",
      "או שלחו את המסמכים כקבצים מצורפים למייל:",
      input.intakeEmailAddress,
      "",
      businessName
    ].join("\n");
  }
}
