import { createHash } from "crypto";
import { CanonicalLeadSubmission, ResolvedLeadConnection } from "./canonicalLeadSubmission";

export function createLeadIdempotencyKey(connection: ResolvedLeadConnection, submission: CanonicalLeadSubmission): string {
    const externalEventId = normalize(submission.source.externalEventId);
    if (externalEventId) return `event:${connection.provider}:${externalEventId}`;

    const externalLeadId = normalize(submission.source.externalLeadId);
    if (externalLeadId) return `lead:${connection.provider}:${externalLeadId}:${submission.source.eventType}`;

    return `hash:${createHash("sha256").update(stableStringify({ connectionId: connection.connectionId, submission })).digest("hex")}`;
}

export function createCanonicalPayloadHash(submission: CanonicalLeadSubmission): string {
    return createHash("sha256").update(stableStringify(submission)).digest("hex");
}

function normalize(value?: string): string | null { const normalized = value?.trim(); return normalized || null; }

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
