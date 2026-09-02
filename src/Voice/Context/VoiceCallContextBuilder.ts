import { PrismaClient } from "../../generated/prisma/client";
import { PortalAccessService } from "../../Portal/PortalAccessService";
import { VoiceCallContext, IVoiceCallContextBuilder } from "./VoiceCallContext";
import { CaseMissingRequirementResolver } from "../../CaseFollowUp/CaseMissingRequirementResolver";

const RECEIVED_DOCUMENT_STATUSES = [
  "UPLOADED",
  "PROCESSING",
  "EXTRACTED",
  "NEEDS_REVIEW",
  "VERIFIED"
] as const;

export class VoiceCallContextBuilder implements IVoiceCallContextBuilder {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly portalAccess: Pick<PortalAccessService, "getOrCreateActiveAccess">,
    private readonly missingResolver: CaseMissingRequirementResolver = new CaseMissingRequirementResolver()
  ) {}

  async build(input: { businessId: number; caseId: number }): Promise<VoiceCallContext | null> {
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: input.caseId, businessId: input.businessId },
      select: {
        id: true,
        business: { select: { businessName: true } },
        lead: { select: { name: true, client: { select: { name: true } } } },
        assignee: { select: { displayName: true } },
        documentSpecifications: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            required: true,
            label: true,
            schema: { select: { name: true, documentType: { select: { name: true } } } },
            documents: { select: { status: true, createdAt: true } }
          }
        }
      }
    });
    if (!caseRecord) return null;
    const portal = await this.portalAccess.getOrCreateActiveAccess(input.businessId, input.caseId);
    const missingDocuments = this.missingResolver.resolve(
      caseRecord.documentSpecifications.map((specification) => ({
        id: specification.id,
        required: specification.required,
        label: specification.label,
        schemaName: specification.schema.name,
        documentTypeName: specification.schema.documentType.name,
        documents: specification.documents
      }))
    ).map(({ label }) => ({ label }));
    const receivedDocuments: Array<{ label: string }> = [];
    for (const specification of caseRecord.documentSpecifications) {
      const label = specification.label?.trim()
        || specification.schema.name.trim()
        || specification.schema.documentType.name.trim();
      const received = specification.documents.some((document) =>
        RECEIVED_DOCUMENT_STATUSES.includes(document.status as typeof RECEIVED_DOCUMENT_STATUSES[number])
      );
      if (received) receivedDocuments.push({ label });
    }
    return {
      caseId: caseRecord.id,
      businessName: caseRecord.business.businessName,
      borrowerName: caseRecord.lead.client?.name?.trim() || caseRecord.lead.name?.trim() || "Borrower",
      advisorName: caseRecord.assignee?.displayName
        ? caseRecord.assignee.displayName.trim() || undefined
        : undefined,
      missingDocuments,
      receivedDocuments,
      uploadUrl: portal?.portalUrl || undefined
    };
  }
}
