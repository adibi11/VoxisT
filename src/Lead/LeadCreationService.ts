import { Prisma, PrismaClient } from "../generated/prisma/client";
import { CreateManualLeadRequestDto } from "../contracts";
import { CanonicalLeadSubmission, validateCanonicalLeadSubmission } from "../LeadIngestion/canonicalLeadSubmission";

export type CampaignLeadCreationResult = {
  outcome: "processed" | "already_processed" | "linked_existing_external_lead";
  crmLeadId: number | null;
  externalLeadId: number | null;
};

/** Creates a CRM lead and its single lead.created notification-work event atomically. */
export class LeadCreationService {
  constructor(private readonly prisma: PrismaClient) {}

  async createManualLead(businessId: number, request: CreateManualLeadRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      const name = optionalText(request.name);
      const email = optionalEmail(request.email);
      const phoneNumber = optionalText(request.phoneNumber);
      if (!request.clientId && !phoneNumber) throw new Error("Manual lead requires clientId or phoneNumber");

      const client = await this.resolveClient(tx, request.clientId, phoneNumber ?? undefined , name ?? undefined);
      return this.createLeadWithEvent(tx, {
        businessId, clientId: client.id, memberId: request.memberId,
        status: (request.status || "NEW") as Prisma.LeadUncheckedCreateInput["status"],
        source: (request.source || "MANUAL") as Prisma.LeadUncheckedCreateInput["source"],
        origin: "MANUAL", score: request.score, summary: optionalText(request.summary), notes: optionalText(request.notes),
        name: name || client.name || undefined, email, phoneNumber: phoneNumber || client.phoneNumber || undefined,
        followUpAt: optionalDate(request.followUpAt), asignTime: request.memberId ? new Date() : undefined
      });
    });
  }

  async createCampaignLead(businessId: number, incomingLeadId: number): Promise<CampaignLeadCreationResult> {
    return this.prisma.$transaction(async (tx) => {
      const incoming = await tx.incomingLead.findFirst({ where: { id: incomingLeadId, businessId } });
      if (!incoming) throw new Error(`Incoming lead ${incomingLeadId} not found for business ${businessId}`);
      if (incoming.status === "PROCESSED") return { outcome: "already_processed", crmLeadId: null, externalLeadId: incoming.externalLeadId };

      const submission = incoming.canonicalPayload as unknown as CanonicalLeadSubmission;
      validateCanonicalLeadSubmission(submission);
      await tx.incomingLead.update({ where: { id: incoming.id }, data: { status: "PROCESSING", failureCode: null, failureDetail: null } });
      const externalIdentity = optionalText(submission.source.externalLeadId) || `incoming:${incoming.id}`;
      const existingExternalLead = await tx.externalLead.findUnique({
        where: { integrationConnectionId_externalLeadId: { integrationConnectionId: incoming.integrationConnectionId, externalLeadId: externalIdentity } }
      });
      if (existingExternalLead) {
        await tx.incomingLead.update({ where: { id: incoming.id }, data: { status: "PROCESSED", processedAt: new Date(), externalLeadId: existingExternalLead.id } });
        return { outcome: "linked_existing_external_lead", crmLeadId: existingExternalLead.leadId, externalLeadId: existingExternalLead.id };
      }

      const lead = await this.createLeadWithEvent(tx, {
        businessId, status: "NEW", source: sourceForProvider(incoming.provider), origin: "CAMPAIGN",
        name: displayName(submission), email: optionalEmail(submission.person.email), phoneNumber: optionalText(submission.person.phone), summary: campaignSummary(submission)
      });
      const externalLead = await tx.externalLead.create({ data: {
        businessId, integrationConnectionId: incoming.integrationConnectionId, leadId: lead.id, provider: incoming.provider,
        externalLeadId: externalIdentity, metadata: jsonOrUndefined(submission.metadata?.providerData)
      } });
      await tx.leadAttribution.create({ data: attributionData(lead.id, incoming.provider, submission) });
      await tx.incomingLead.update({ where: { id: incoming.id }, data: { status: "PROCESSED", processedAt: new Date(), externalLeadId: externalLead.id } });
      return { outcome: "processed", crmLeadId: lead.id, externalLeadId: externalLead.id };
    });
  }

  private async createLeadWithEvent(tx: Prisma.TransactionClient, data: Prisma.LeadUncheckedCreateInput) {
    return tx.lead.create({ data });
  }

  private async resolveClient(tx: Prisma.TransactionClient, clientId?: number | null, phoneNumber?: string, name?: string) {
    if (clientId) {
      const client = await tx.client.findUnique({ where: { id: clientId } });
      if (!client) throw new Error(`Client ${clientId} not found`);
      return name && client.name !== name ? tx.client.update({ where: { id: client.id }, data: { name } }) : client;
    }
    if (!phoneNumber) throw new Error("Manual lead requires clientId or phoneNumber");
    const client = await tx.client.findUnique({ where: { phoneNumber } });
    if (client) return name && client.name !== name ? tx.client.update({ where: { id: client.id }, data: { name } }) : client;
    return tx.client.create({ data: { phoneNumber, name } });
  }
}

function attributionData(leadId: number, provider: string, submission: CanonicalLeadSubmission): Prisma.LeadAttributionUncheckedCreateInput {
  const a = submission.attribution;
  return { leadId, provider, campaignExternalId: optionalText(a?.campaign?.externalId), campaignName: optionalText(a?.campaign?.name), formExternalId: optionalText(a?.form?.externalId), formName: optionalText(a?.form?.name), adExternalId: optionalText(a?.ad?.externalId), adSetExternalId: optionalText(a?.ad?.adSetExternalId), landingPageUrl: optionalText(a?.landingPageUrl), utmSource: optionalText(a?.utm?.source), utmMedium: optionalText(a?.utm?.medium), utmCampaign: optionalText(a?.utm?.campaign), utmContent: optionalText(a?.utm?.content), utmTerm: optionalText(a?.utm?.term), referrer: optionalText(a?.referrer), raw: jsonOrUndefined(a) };
}
function sourceForProvider(provider: string): "FACEBOOK" | "GOOGLE_ADS" | "WEBSITE" | "OTHER" { const p = provider.toLowerCase(); return p.includes("meta") || p.includes("facebook") ? "FACEBOOK" : p.includes("google") ? "GOOGLE_ADS" : p.includes("landing") || p.includes("webflow") || p.includes("typeform") ? "WEBSITE" : "OTHER"; }
function displayName(s: CanonicalLeadSubmission) { return optionalText(s.person.fullName) || [optionalText(s.person.firstName), optionalText(s.person.lastName)].filter(Boolean).join(" ") || null; }
function campaignSummary(s: CanonicalLeadSubmission) { const name = optionalText(s.attribution?.campaign?.name); return name ? `Campaign lead from ${name}.` : "Campaign lead ingested through integration."; }
function optionalText(value?: string | null) { const normalized = value?.trim(); return normalized || null; }
function optionalEmail(value?: string | null) { const normalized = optionalText(value); return normalized?.toLowerCase() || null; }
function optionalDate(value?: string | null): Date | null | undefined { if (value === undefined) return undefined; if (value === null || value.trim() === "") return null; const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${value}`); return date; }
function jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined { return value === undefined || value === null ? undefined : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
