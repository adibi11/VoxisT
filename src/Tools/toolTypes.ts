import { ILogger } from "../logging/logger";

// Execution context every tool receives: who the conversation belongs to and
// where to log. Tools never receive raw LLM text - only validated data.
export type ToolContext = {
    businessId: number;
    clientId: number;
    conversationId: number;
    logger: ILogger;
};

// A capability the conversation engine can perform. The shape mirrors the
// OpenAI function-calling contract (name / description / JSON-schema params)
// on purpose: today tools are invoked deterministically by the FSM, and the
// same registry can later be handed to the model as native tools without a
// redesign.
export interface IConversationTool<TParams = Record<string, unknown>, TResult = unknown> {
    readonly name: string;
    readonly description: string;
    readonly paramsSchema: Record<string, unknown>;
    execute(context: ToolContext, params: TParams): Promise<TResult>;
}
