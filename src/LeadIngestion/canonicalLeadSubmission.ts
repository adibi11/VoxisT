export type CanonicalLeadField = {
    key: string;
    label?: string;
    value: string | number | boolean | null;
    valueType?: "text" | "number" | "boolean" | "date" | "choice" | "unknown";
};

export type CanonicalLeadSubmission = {
    schemaVersion: 1;
    source: {
        provider: string;
        integrationType: "LEAD_ADS" | "FORM" | "LANDING_PAGE" | "CUSTOM_API" | "MESSAGING";
        eventType: string;
        externalEventId?: string;
        externalLeadId?: string;
        occurredAt?: string;
        receivedAt: string;
    };
    person: {
        firstName?: string ;
        lastName?: string;
        fullName?: string;
        email?: string;
        phone?: string;
        preferredContactChannel?: "phone" | "email" | "whatsapp" | "sms" | "other";
        locale?: string;
        timezone?: string;
    };
    answers: { fields: CanonicalLeadField[] };
    attribution?: {
        campaign?: { externalId?: string; name?: string; source?: string; medium?: string };
        form?: { externalId?: string; name?: string };
        ad?: { externalId?: string; name?: string; adSetExternalId?: string };
        landingPageUrl?: string;
        utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
        referrer?: string;
    };
    consent?: {
        marketing?: { granted?: boolean; capturedAt?: string; textVersion?: string };
        contact?: { granted?: boolean; capturedAt?: string; channels?: string[] };
    };
    metadata?: { providerData?: Record<string, string | number | boolean | null>; tags?: string[] };
};

export type ResolvedLeadConnection = {
    connectionId: number;
    businessId: number;
    provider: string;
    integrationType: CanonicalLeadSubmission["source"]["integrationType"];
};

export function validateCanonicalLeadSubmission(submission: CanonicalLeadSubmission): void {
    if (submission.schemaVersion !== 1) throw new Error("Unsupported canonical lead schema version");
    if (!submission.source.provider.trim() || !submission.source.eventType.trim()) throw new Error("Lead source provider and event type are required");
    if (!Number.isFinite(new Date(submission.source.receivedAt).getTime())) throw new Error("Lead source receivedAt must be an ISO date");
    if (submission.source.occurredAt && !Number.isFinite(new Date(submission.source.occurredAt).getTime())) throw new Error("Lead source occurredAt must be an ISO date");
    if (!Array.isArray(submission.answers.fields)) throw new Error("Lead answers fields must be an array");

    const person = submission.person;
    if (!person.fullName?.trim() && !person.firstName?.trim() && !person.lastName?.trim() && !person.email?.trim() && !person.phone?.trim()) {
        throw new Error("Lead requires at least one person identity field");
    }
}
