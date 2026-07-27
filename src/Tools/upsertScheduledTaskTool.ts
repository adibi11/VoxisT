import { IDatabaseClient } from "../dataClients/SqlClient/sqlInterface";
import { IConversationTool, ToolContext } from "./toolTypes";

export const UPSERT_SCHEDULED_TASK_TOOL = "upsert_scheduled_task";

export type UpsertScheduledTaskParams = {
    // ISO 8601, already validated by the executer's normalization gate.
    scheduledForIso: string;
    clientName?: string | null;
    clientPhone?: string | null;
    summary?: string | null;
};

export type UpsertScheduledTaskResult = {
    taskId: number;
    created: boolean;
};

// Creates or reschedules the AI callback task for a conversation. Idempotent
// on (businessId, clientId, conversationId): a client changing the agreed
// time updates the same task instead of creating a duplicate, and the
// business owner is (re)notified through the activity-event outbox.
export class UpsertScheduledTaskTool implements IConversationTool<UpsertScheduledTaskParams, UpsertScheduledTaskResult> {
    readonly name = UPSERT_SCHEDULED_TASK_TOOL;
    readonly description =
        "Create or update the callback task for this conversation at the agreed time. " +
        "The task is unassigned; the business owner assigns an employee.";
    readonly paramsSchema = {
        type: "object",
        properties: {
            scheduledForIso: {
                type: "string",
                description: "Agreed callback time as an ISO 8601 timestamp"
            },
            clientName: { type: "string", description: "Client display name, if known" },
            clientPhone: { type: "string", description: "Client phone number" },
            summary: { type: "string", description: "One-line context for the business owner" }
        },
        required: ["scheduledForIso"]
    };

    constructor(private readonly sql: IDatabaseClient) {}

    async execute(context: ToolContext, params: UpsertScheduledTaskParams): Promise<UpsertScheduledTaskResult> {
        const scheduledFor = new Date(params.scheduledForIso);
        if (!Number.isFinite(scheduledFor.getTime())) {
            throw new Error(`upsert_scheduled_task received an invalid time: ${params.scheduledForIso}`);
        }
        

        return this.sql.upsertConversationScheduledTask({
            businessId: context.businessId,
            clientId: context.clientId,
            conversationId: context.conversationId,
            scheduledFor,
            clientName: params.clientName ?? null,
            clientPhone: params.clientPhone ?? null,
            summary: params.summary ?? null
        });
    }
}
