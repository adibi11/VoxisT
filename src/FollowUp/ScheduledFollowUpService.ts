import { IDatabaseClient } from "../dataClients/SqlClient/sqlInterface";
import { DueConversationFollowUpCandidate } from "../dataClients/SqlClient/Repositories/FollowUpRepo/IFollowUpRepository";
import { CommunicationChannel, MessageProvider } from "../dataClients/Types/apiTypes";
import { IOutboundMessageQueue } from "../QueueClient/queue";
import { ILogger, logger } from "../logging/logger";
import { FollowUpPolicyService, isWithinAllowedHours } from "./FollowUpPolicyService";

export type ScheduledFollowUpServiceOptions = {
    intervalMs?: number;
    policyCreationLimit?: number;
    dueFollowUpLimit?: number;
};

export class ScheduledFollowUpService {
    private readonly intervalMs: number;
    private readonly policyCreationLimit: number;
    private readonly dueFollowUpLimit: number;
    private readonly followUpPolicyService: FollowUpPolicyService;
    private timer?: NodeJS.Timeout;

    constructor(
        private readonly sql: IDatabaseClient,
        private readonly outboundQueue: IOutboundMessageQueue,
        private readonly serviceLogger: ILogger = logger.child({ component: "ScheduledFollowUpService" }),
        options: ScheduledFollowUpServiceOptions = {}
    ) {
        this.intervalMs = options.intervalMs ?? 60_000;
        this.policyCreationLimit = options.policyCreationLimit ?? 100;
        this.dueFollowUpLimit = options.dueFollowUpLimit ?? 100;
        this.followUpPolicyService = new FollowUpPolicyService(this.sql.followUpRepository);
    }

    start(): void {
        if (this.timer) {
            return;
        }

        this.serviceLogger.info("follow_up.scheduler.started", { intervalMs: this.intervalMs });
        this.timer = setInterval(() => {
            void this.runOnce().catch((error) => {
                this.serviceLogger.error("follow_up.scheduler.tick.failed", { error });
            });
        }, this.intervalMs);

        void this.runOnce().catch((error) => {
            this.serviceLogger.error("follow_up.scheduler.initial_tick.failed", { error });
        });
    }

    stop(): void {
        if (!this.timer) {
            return;
        }

        clearInterval(this.timer);
        this.timer = undefined;
        this.serviceLogger.info("follow_up.scheduler.stopped");
    }

    async runOnce(now: Date = new Date()): Promise<void> {
        this.serviceLogger.info("follow_up.scheduler.tick.started", { now: now.toISOString() });

        const creationResult = await this.followUpPolicyService.createFollowUpsFromPolicies({
            limit: this.policyCreationLimit,
            now
        });
        const dueFollowUps = await this.sql.followUpRepository.getDuePendingFollowUps(now, this.dueFollowUpLimit);
        const resultCounts: Record<ProcessDueFollowUpResult, number> = {
            sent: 0,
            deferred: 0,
            skipped: 0,
            failed: 0,
            already_claimed: 0
        };

        for (const dueFollowUp of dueFollowUps) {
            const processResult = await this.processDueFollowUp(dueFollowUp, now);
            resultCounts[processResult] += 1;
        }

        this.serviceLogger.info("follow_up.scheduler.tick.finished", {
            createdCount: creationResult.created.length,
            creationSkippedCount: creationResult.skipped.length,
            dueCount: dueFollowUps.length,
            ...resultCounts
        });
    }

    private async processDueFollowUp(
        candidate: DueConversationFollowUpCandidate,
        now: Date
    ): Promise<ProcessDueFollowUpResult> {
        if (hasUserRepliedAfterLastBot(candidate)) {
            const claimedFollowUp = await this.sql.followUpRepository.claimPendingFollowUp(candidate.followUp.id);
            if (!claimedFollowUp) {
                return "already_claimed";
            }

            await this.sql.followUpRepository.updateConversationFollowUp(candidate.business.id, candidate.followUp.id, {
                status: "SKIPPED",
                skippedReason: "user_replied_after_last_bot"
            });
            this.serviceLogger.info("follow_up.skipped.user_replied_after_last_bot", {
                followUpId: candidate.followUp.id,
                businessId: candidate.business.id,
                conversationId: candidate.conversation.id
            });
            return "skipped";
        }

        if (!isWithinAllowedHours(
            now,
            candidate.policy.timezone,
            candidate.policy.allowedStartHour,
            candidate.policy.allowedEndHour
        )) {
            this.serviceLogger.info("follow_up.deferred.outside_allowed_hours", {
                followUpId: candidate.followUp.id,
                businessId: candidate.business.id,
                conversationId: candidate.conversation.id,
                timezone: candidate.policy.timezone
            });
            return "deferred";
        }

        const claimedFollowUp = await this.sql.followUpRepository.claimPendingFollowUp(candidate.followUp.id);
        if (!claimedFollowUp) {
            return "already_claimed";
        }

        const body = buildFollowUpMessage(candidate);

        try {
            await this.outboundQueue.addOutboundMessage({
                message: {
                    channel: toCommunicationChannel(candidate.conversation.channel),
                    provider: toMessageProvider(candidate.conversation.provider),
                    from: candidate.business.phone,
                    to: candidate.client.phone,
                    body,
                    businessId: candidate.business.id,
                    clientId: candidate.client.id,
                    conversationId: candidate.conversation.id
                }
            });

            await this.sql.followUpRepository.updateConversationFollowUp(candidate.business.id, candidate.followUp.id, {
                status: "SENT",
                sentAt: now.toISOString(),
                messageBody: body,
                skippedReason: null
            });
            await this.sql.followUpRepository.updateConversationFollowUpState(candidate.conversation.id, {
                lastFollowUpAt: now.toISOString(),
                followUpCount: candidate.conversation.followUpCount + 1,
                nextFollowUpAt: null
            });

            this.serviceLogger.info("follow_up.sent", {
                followUpId: candidate.followUp.id,
                businessId: candidate.business.id,
                clientId: candidate.client.id,
                conversationId: candidate.conversation.id,
                channel: candidate.conversation.channel,
                provider: candidate.conversation.provider
            });
            return "sent";
        } catch (error) {
            await this.sql.followUpRepository.updateConversationFollowUp(candidate.business.id, candidate.followUp.id, {
                status: "FAILED",
                skippedReason: getErrorMessage(error),
                messageBody: body
            });

            this.serviceLogger.error("follow_up.send.failed", {
                followUpId: candidate.followUp.id,
                businessId: candidate.business.id,
                clientId: candidate.client.id,
                conversationId: candidate.conversation.id,
                error
            });
            return "failed";
        }
    }
}

type ProcessDueFollowUpResult =
    | "sent"
    | "deferred"
    | "skipped"
    | "failed"
    | "already_claimed";

function hasUserRepliedAfterLastBot(candidate: DueConversationFollowUpCandidate): boolean {
    const lastUserMessageAt = parseDate(candidate.conversation.lastUserMessageAt);
    const lastBotMessageAt = parseDate(candidate.conversation.lastBotMessageAt);
    return Boolean(lastUserMessageAt && lastBotMessageAt && lastUserMessageAt >= lastBotMessageAt);
}

function buildFollowUpMessage(candidate: DueConversationFollowUpCandidate): string {
    const configuredMessage = candidate.followUp.messageBody || candidate.policy.messageTemplate;
    if (configuredMessage?.trim()) {
        return configuredMessage.trim();
    }
    //Need to create more logic here
    return "Hi, just following up on our conversation. Would you like to continue?";
}


function toCommunicationChannel(channel: string): CommunicationChannel {
    if (Object.values(CommunicationChannel).includes(channel as CommunicationChannel)) {
        return channel as CommunicationChannel;
    }

    return CommunicationChannel.Whatsapp;
}

function toMessageProvider(provider: string): MessageProvider {
    if (Object.values(MessageProvider).includes(provider as MessageProvider)) {
        return provider as MessageProvider;
    }

    return MessageProvider.Twilio;
}

function parseDate(value?: string | null): Date | null {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return "follow_up_send_failed";
}
