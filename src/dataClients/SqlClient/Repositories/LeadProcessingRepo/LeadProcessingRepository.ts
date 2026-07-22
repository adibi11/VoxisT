import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { CanonicalLeadSubmission, validateCanonicalLeadSubmission } from "../../../../LeadIngestion/canonicalLeadSubmission";
import { ILeadProcessingRepository, ProcessIncomingLeadResult } from "./ILeadProcessingRepository";

export class LeadProcessingRepository implements ILeadProcessingRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async processCampaignLead(businessId: number, incomingLeadId: number): Promise<ProcessIncomingLeadResult> {
        return this.prisma.$transaction(async (tx) => {
            const incoming = await tx.incomingLead.findFirst({ where: { id: incomingLeadId, businessId } });
            if (!incoming) throw new Error(`Incoming lead ${incomingLeadId} not found for business ${businessId}`);
            if (incoming.status === "PROCESSED") return { outcome: "already_processed", crmLeadId: null, externalLeadId: incoming.externalLeadId };

            const submission = incoming.canonicalPayload as unknown as CanonicalLeadSubmission;
            validateCanonicalLeadSubmission(submission);
            await tx.incomingLead.update({ where: { id: incoming.id }, data: { status: "PROCESSING", failureCode: null, failureDetail: null } });

            const externalIdentity = normalize(submission.source.externalLeadId) || `incoming:${incoming.id}`;
            const existingExternalLead = await tx.externalLead.findUnique({
                where: { integrationConnectionId_externalLeadId: { integrationConnectionId: incoming.integrationConnectionId, externalLeadId: externalIdentity } }
            });
            if (existingExternalLead) {
                await tx.incomingLead.update({ where: { id: incoming.id }, data: { status: "PROCESSED", processedAt: new Date(), externalLeadId: existingExternalLead.id } });
                return { outcome: "linked_existing_external_lead", crmLeadId: existingExternalLead.leadId, externalLeadId: existingExternalLead.id };
            }

            
            const crmLead = await tx.lead.create({
                data: {
                    businessId,
                    status: "NEW",
                    source: leadSourceForProvider(incoming.provider),
                    origin: "CAMPAIGN",
                    name: displayName(submission),
                    email: normalizeEmail(submission.person.email),
                    phoneNumber: normalize(submission.person.phone),
                    summary: campaignSummary(submission)
                }
            });
            const externalLead = await tx.externalLead.create({
                data: {
                    businessId,
                    integrationConnectionId: incoming.integrationConnectionId,
                    leadId: crmLead.id,
                    provider: incoming.provider,
                    externalLeadId: externalIdentity,
                    metadata: jsonOrUndefined(submission.metadata?.providerData)
                }
            });
            await tx.leadAttribution.create({ data: attributionData(crmLead.id, incoming.provider, submission) });
            await tx.incomingLead.update({ where: { id: incoming.id }, data: { status: "PROCESSED", processedAt: new Date(), externalLeadId: externalLead.id } });
            return { outcome: "processed", crmLeadId: crmLead.id, externalLeadId: externalLead.id };
        });
    }
}

function attributionData(leadId: number, provider: string, submission: CanonicalLeadSubmission): Prisma.LeadAttributionUncheckedCreateInput {
    const attribution = submission.attribution;
    return {
        leadId, provider,
        campaignExternalId: normalize(attribution?.campaign?.externalId), campaignName: normalize(attribution?.campaign?.name),
        formExternalId: normalize(attribution?.form?.externalId), formName: normalize(attribution?.form?.name),
        adExternalId: normalize(attribution?.ad?.externalId), adSetExternalId: normalize(attribution?.ad?.adSetExternalId),
        landingPageUrl: normalize(attribution?.landingPageUrl), utmSource: normalize(attribution?.utm?.source),
        utmMedium: normalize(attribution?.utm?.medium), utmCampaign: normalize(attribution?.utm?.campaign),
        utmContent: normalize(attribution?.utm?.content), utmTerm: normalize(attribution?.utm?.term),
        referrer: normalize(attribution?.referrer), raw: jsonOrUndefined(attribution)
    };
}

function leadSourceForProvider(provider: string): "FACEBOOK" | "GOOGLE_ADS" | "WEBSITE" | "OTHER" {
    const normalized = provider.toLowerCase();
    if (normalized.includes("meta") || normalized.includes("facebook")) return "FACEBOOK";
    if (normalized.includes("google")) return "GOOGLE_ADS";
    if (normalized.includes("landing") || normalized.includes("webflow") || normalized.includes("typeform")) return "WEBSITE";
    return "OTHER";
}

function displayName(submission: CanonicalLeadSubmission): string | null { return normalize(submission.person.fullName) || [normalize(submission.person.firstName), normalize(submission.person.lastName)].filter(Boolean).join(" ") || null; }
function campaignSummary(submission: CanonicalLeadSubmission): string | null { const name = normalize(submission.attribution?.campaign?.name); return name ? `Campaign lead from ${name}.` : "Campaign lead ingested through integration."; }
function normalize(value?: string): string | null { const normalized = value?.trim(); return normalized || null; }
function normalizeEmail(value?: string): string | null { const normalized = normalize(value); return normalized?.toLowerCase() || null; }
function jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined { return value === undefined || value === null ? undefined : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
