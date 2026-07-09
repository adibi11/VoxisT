import { ConversationFollowUpDto } from "../contracts";
import {
    IFollowUpRepository,
    OpenConversationPolicyCandidate
} from "../dataClients/SqlClient/Repositories/FollowUpRepo/IFollowUpRepository";

export type CreateFollowUpByPolicyInput = {
    businessId: number;
    conversationId: number;
    now?: Date;
};

export type CreateFollowUpByPolicyResult =
    | {
        created: true;
        followUp: ConversationFollowUpDto;
    }
    | {
        created: false;
        reason:
            | "policy_not_found"
            | "policy_disabled"
            | "conversation_not_found"
            | "conversation_not_active"
            | "max_follow_ups_reached"
            | "missing_last_bot_message"
            | "user_replied_after_bot"
            | "follow_up_already_pending";
    };

export type CreateFollowUpsFromPoliciesInput = {
    limit: number;
    now?: Date;
};

export type PolicyFollowUpSkippedReason =
    | "missing_last_bot_message"
    | "delay_not_elapsed";

export type CreateFollowUpsFromPoliciesResult = {
    checkedCount: number;
    created: ConversationFollowUpDto[];
    skipped: Array<{
        businessId: number;
        conversationId: number;
        reason: PolicyFollowUpSkippedReason;
    }>;
};

const CLOSED_CONVERSATION_STATUSES = new Set([
    "ended",
    "failure",
    "schedulingConfirmed",
    "schedulingFailed"
]);

const OPEN_FOLLOW_UP_STATUSES = new Set([
    "PENDING",
    "PROCESSING"
]);

export class FollowUpPolicyService {
    constructor(private readonly followUpRepository: IFollowUpRepository) {}

    /**
     * Creates pending follow-up tasks from business policy.
     *
     * The repository query intentionally does only stable DB filtering:
     * open conversation, enabled policy, latest bot message, max follow-up count,
     * and no already-open follow-up. This method then applies only the policy rules
     * required to decide whether a pending follow-up row should exist.
     *
     * Allowed-hours are intentionally checked later, immediately before sending.
     * A follow-up row is the tracking record; it can stay pending until the next
     * acceptable sending window.
     */
    async createFollowUpsFromPolicies(input: CreateFollowUpsFromPoliciesInput): Promise<CreateFollowUpsFromPoliciesResult> {
        const now = input.now || new Date();
        const candidates = await this.followUpRepository.getOpenConversationPolicyCandidates(input.limit);
        const result: CreateFollowUpsFromPoliciesResult = {
            checkedCount: candidates.length,
            created: [],
            skipped: []
        };

        for (const candidate of candidates) {
            const policyDecision = evaluateCandidatePolicy(candidate, now);
            if (!policyDecision.shouldCreate) {
                result.skipped.push({
                    businessId: candidate.business.id,
                    conversationId: candidate.conversation.id,
                    reason: policyDecision.reason
                });
                continue;
            }

            const followUp = await this.followUpRepository.createConversationFollowUp(candidate.business.id, {
                conversationId: candidate.conversation.id,
                status: "PENDING",
                scheduledFor: policyDecision.scheduledFor.toISOString(),
                messageBody: candidate.policy.messageTemplate ?? null,
                metadata: {
                    createdBy: "policy",
                    createdAt: now.toISOString(),
                    delayMinutes: candidate.policy.delayMinutes,
                    timezone: candidate.policy.timezone,
                    basedOnLastBotMessageAt: policyDecision.lastBotMessageAt.toISOString()
                }
            });

            result.created.push(followUp);
        }

        return result;
    }

    async createFollowUpByPolicy(input: CreateFollowUpByPolicyInput): Promise<CreateFollowUpByPolicyResult> {
        const policy = await this.followUpRepository.getBusinessFollowUpPolicy(input.businessId);
        if (!policy) {
            return { created: false, reason: "policy_not_found" };
        }

        if (!policy.enabled) {
            return { created: false, reason: "policy_disabled" };
        }

        const conversation = await this.followUpRepository.getConversationFollowUpState(input.businessId, input.conversationId);
        if (!conversation) {
            return { created: false, reason: "conversation_not_found" };
        }

        if (CLOSED_CONVERSATION_STATUSES.has(conversation.status)) {
            return { created: false, reason: "conversation_not_active" };
        }

        if (conversation.followUpCount >= policy.maxFollowUps) {
            return { created: false, reason: "max_follow_ups_reached" };
        }

        const lastBotMessageAt = parseDate(conversation.lastBotMessageAt);
        if (!lastBotMessageAt) {
            return { created: false, reason: "missing_last_bot_message" };
        }

        const lastUserMessageAt = parseDate(conversation.lastUserMessageAt);
        if (lastUserMessageAt && lastUserMessageAt >= lastBotMessageAt) {
            return { created: false, reason: "user_replied_after_bot" };
        }

        const existingFollowUps = await this.followUpRepository.getConversationFollowUps(input.businessId, input.conversationId);
        if (existingFollowUps.some((followUp) => OPEN_FOLLOW_UP_STATUSES.has(followUp.status))) {
            return { created: false, reason: "follow_up_already_pending" };
        }

        const scheduledFor = parseDate(conversation.nextFollowUpAt)
            || addMinutes(lastBotMessageAt, policy.delayMinutes);

        const followUp = await this.followUpRepository.createConversationFollowUp(input.businessId, {
            conversationId: input.conversationId,
            status: "PENDING",
            scheduledFor: scheduledFor.toISOString(),
            messageBody: policy.messageTemplate ?? null,
            metadata: {
                createdBy: "policy",
                createdAt: (input.now || new Date()).toISOString(),
                delayMinutes: policy.delayMinutes,
                basedOnLastBotMessageAt: lastBotMessageAt.toISOString()
            }
        });

        return { created: true, followUp };
    }
}

type CandidatePolicyDecision =
    | {
        shouldCreate: true;
        scheduledFor: Date;
        lastBotMessageAt: Date;
    }
    | {
        shouldCreate: false;
        reason: PolicyFollowUpSkippedReason;
    };

function evaluateCandidatePolicy(candidate: OpenConversationPolicyCandidate, now: Date): CandidatePolicyDecision {
    const lastBotMessageAt = parseDate(candidate.conversation.lastBotMessageAt);
    if (!lastBotMessageAt) {
        return { shouldCreate: false, reason: "missing_last_bot_message" };
    }

    const scheduledFor = parseDate(candidate.conversation.nextFollowUpAt)
        || addMinutes(lastBotMessageAt, candidate.policy.delayMinutes);

    if (scheduledFor > now) {
        return { shouldCreate: false, reason: "delay_not_elapsed" };
    }

    return {
        shouldCreate: true,
        scheduledFor,
        lastBotMessageAt
    };
}

export function isWithinAllowedHours(
    date: Date,
    timezone: string,
    allowedStartHour?: number | null,
    allowedEndHour?: number | null
): boolean {
    if (allowedStartHour === undefined && allowedEndHour === undefined) {
        return true;
    }

    const localHour = getHourInTimeZone(date, timezone);
    if (localHour === null) {
        return false;
    }

    if (allowedStartHour === null || allowedStartHour === undefined) {
        return allowedEndHour === null || allowedEndHour === undefined || localHour < allowedEndHour;
    }

    if (allowedEndHour === null || allowedEndHour === undefined) {
        return localHour >= allowedStartHour;
    }

    if (allowedStartHour === allowedEndHour) {
        return true;
    }

    if (allowedStartHour < allowedEndHour) {
        return localHour >= allowedStartHour && localHour < allowedEndHour;
    }

    return localHour >= allowedStartHour || localHour < allowedEndHour;
}

function getHourInTimeZone(date: Date, timezone: string): number | null {
    try {
        const hour = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone || "UTC",
            hour: "numeric",
            hour12: false,
            hourCycle: "h23"
        }).format(date);
        const parsedHour = Number(hour);
        return Number.isInteger(parsedHour) ? parsedHour : null;
    } catch {
        return null;
    }
}

function parseDate(value?: string | null): Date | null {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60_000);
}
