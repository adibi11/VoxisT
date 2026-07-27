import { ILogger, logger } from "../logging/logger";
import { IConversationTool, ToolContext } from "./toolTypes";

export class ToolRegistry {
    private readonly tools = new Map<string, IConversationTool<any, any>>();
    private readonly logger: ILogger;

    constructor(loggerInstance: ILogger = logger.child({ component: "ToolRegistry" })) {
        this.logger = loggerInstance;
    }

    register(tool: IConversationTool<any, any>): void {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool "${tool.name}" is already registered`);
        }
        this.tools.set(tool.name, tool);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    async execute<TResult = unknown>(
        name: string,
        context: ToolContext,
        params: Record<string, unknown>
    ): Promise<TResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool "${name}" is not registered`);
        }

        this.logger.info("tool.execute.started", {
            tool: name,
            businessId: context.businessId,
            clientId: context.clientId,
            conversationId: context.conversationId
        });

        try {
            const result = await tool.execute(context, params);
            this.logger.info("tool.execute.finished", { tool: name, conversationId: context.conversationId });
            return result as TResult;
        } catch (error) {
            this.logger.error("tool.execute.failed", { tool: name, conversationId: context.conversationId, error });
            throw error;
        }
    }

    // Serialization hook for a future native tool-calling integration:
    // returns the registry in the OpenAI "tools" wire format.
    toOpenAiTools(): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
        return [...this.tools.values()].map((tool) => ({
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.paramsSchema
            }
        }));
    }
}
