import { ILlmProvider } from "../../llm/llmInterface";
import { BotMsg, StateMachineInput, StateMachineOutput } from "../../dataClients/Types/stateMachineTypes";
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { ConversationStateMachine } from "./conversationSM";
import { LlmOutput } from "../../dataClients/Types/llmTypes";
import { normalizeParamValue, normalizeTimeString } from "../../dataClients/Types/paramTypes";
import { getClientNameParamValue } from "../../dataClients/Types/clientNameParam";
import { ILogger, logger } from "../../logging/logger";
import { parseFollowUpResponse } from "../../llm/promptHandler";
import { ToolRegistry } from "../../Tools/ToolRegistry";
import { UPSERT_SCHEDULED_TASK_TOOL } from "../../Tools/upsertScheduledTaskTool";
import { ResponseIntent } from "../../dataClients/Types/stateMachineTypes";

// Identifies the conversation for tool side effects (task upsert idempotency).
export type ConversationActor = {
    businessId: number;
    clientId: number;
};

export class Executer{
    private llmProvider: ILlmProvider;
    private StateMachine: ConversationStateMachine;
    private logger: ILogger;
    private toolRegistry?: ToolRegistry;

    constructor(llmProvider: ILlmProvider, loggerInstance: ILogger = logger.child({ component: "Executer" }), toolRegistry?: ToolRegistry)
    {
        this.llmProvider = llmProvider;
        this.logger = loggerInstance;
        this.toolRegistry = toolRegistry;
        this.StateMachine = new ConversationStateMachine(this.logger.child({ component: "ConversationStateMachine" }));
    }

    async prepareAndExecute(input: StateMachineInput,cacheState: ConversationCacheState, actor?: ConversationActor) :Promise<LlmOutput>
    {
        this.logger.info("llm.event.extract.started", {
            currentState: input.currentState,
            lastMessagesCount: input.lastMessages.length,
            collectedParamNames: Object.keys(input.collectedParams)
        });
        const output = await this.llmProvider.extractEvents(input);
        output.params = this.normalizeExtractedParams(input, output.params);
        output.scheduledTime = this.normalizeScheduledTime(output.scheduledTime);
        this.logger.info("llm.event.extracted", {
            currentState: input.currentState,
            conversationEvent: output.conversationEvent,
            conversationMode: output.conversationMode,
            responseIntent: output.responseIntent,
            newConclusion: output.newConclusion,
            params: output.params,
            scheduledTime: output.scheduledTime
        });
        const stateBefore = cacheState.state;
        const NextMessage = this.StateMachine.recognizeNewState(output, cacheState, {
            schedulingEnabled: input.schedulingEnabled
        });
        this.logger.info("state.transition.recognized", {
            fromState: stateBefore,
            toState: cacheState.state,
            actions: NextMessage
        });
        return this.execute(input, output, cacheState, NextMessage, actor);

    }

    // The LLM's proposed callback time only counts once it survives the same
    // ISO normalization gate used for TIME parameters.
    private normalizeScheduledTime(rawValue: string | undefined): string | undefined {
        if (!rawValue) {
            return undefined;
        }

        const normalized = normalizeTimeString(rawValue);
        if (!normalized) {
            this.logger.warn("llm.scheduled_time.dropped_invalid", { rawValue });
            return undefined;
        }

        return normalized;
    }

    async ExecuteFollowUp(input: StateMachineInput) :Promise<LlmOutput>
    {
        const output = await this.llmProvider.getFollowUpMessage(input);
        const response = parseFollowUpResponse(output);

        return {
            response,
            collectedParams: input.collectedParams
        };

        
    }

    async execute(input: StateMachineInput,output: StateMachineOutput,cacheState: ConversationCacheState,actions: BotMsg[], actor?: ConversationActor): Promise<LlmOutput>
    {
        let answer: string = "";
        for(const action of actions)
        {

            switch(action)
            {
                case BotMsg.sendWelcomeMessage:
                    // Call method to send welcome message
                    answer = "starter";
                    break;
                case BotMsg.askForParams:
                    // Call method to ask for missing parameters
                    answer = await this.askForMissingParams(input, output);
                    break;
                case BotMsg.tryClosing:
                    // Call method to attempt closing the conversation
                    answer = await this.tryClosingConversation(input, output);
                    break;
                case BotMsg.endConversation:
                    // Call method to end the conversation
                    answer = "ender";
                    break;

                case BotMsg.escalateToHuman:
                    answer = "escalate";
                    break;
                case BotMsg.clarify:
                    // Call method to ask user for clarification
                    answer = await this.clarify(input, cacheState);
                    break;
                case BotMsg.proposeSchedule:
                    answer = await this.proposeSchedule(input, output);
                    break;
                case BotMsg.confirmSchedule:
                    answer = await this.confirmSchedule(input, output, cacheState, actor);
                    break;
                default:
                    this.logger.warn("action.unknown", { action });
            }
        }
        return {
            response: answer || "Actions executed. Check logs for details.",
            collectedParams: cacheState.collectedParams


        };
    }

    async proposeSchedule(input: StateMachineInput, output: StateMachineOutput): Promise<string>
    {
        output.responseIntent = ResponseIntent.proposeSchedule;
        this.logger.info("llm.schedule.propose.started", {
            currentState: input.currentState,
            conversationEvent: output.conversationEvent,
            conversationMode: output.conversationMode
        });
        const response = await this.llmProvider.generateResponse(input, output);
        this.logger.info("llm.schedule.propose.finished", { responseLength: response.length });
        return response;
    }

    // The side effect happens here, deterministically: the FSM confirmed the
    // transition and the time already passed the normalization gate. The LLM
    // only generates the confirmation wording.
    async confirmSchedule(
        input: StateMachineInput,
        output: StateMachineOutput,
        cacheState: ConversationCacheState,
        actor?: ConversationActor
    ): Promise<string>
    {
        const scheduledFor = cacheState.scheduledFor;
        if (scheduledFor && this.toolRegistry?.has(UPSERT_SCHEDULED_TASK_TOOL) && actor) {
            try {
                const result = await this.toolRegistry.execute<{ taskId: number; created: boolean }>(
                    UPSERT_SCHEDULED_TASK_TOOL,
                    {
                        businessId: actor.businessId,
                        clientId: actor.clientId,
                        conversationId: cacheState.conversationId,
                        logger: this.logger.child({ component: "ToolContext" })
                    },
                    {
                        scheduledForIso: scheduledFor,
                        clientName: getClientNameParamValue(cacheState.collectedParams),
                        clientPhone: cacheState.phone,
                        summary: output.newConclusion || null
                    }
                );
                cacheState.scheduledTaskId = result.taskId;
            } catch (error) {
                // The user already agreed; failing the whole message would
                // retry the LLM turn. Log loudly and still confirm - the
                // upsert is idempotent and a later turn can heal it.
                this.logger.error("schedule.task.upsert.failed", {
                    conversationId: cacheState.conversationId,
                    scheduledFor,
                    error
                });
            }
        } else {
            this.logger.warn("schedule.task.upsert.skipped", {
                conversationId: cacheState.conversationId,
                hasScheduledFor: Boolean(scheduledFor),
                hasToolRegistry: Boolean(this.toolRegistry),
                hasActor: Boolean(actor)
            });
        }

        output.responseIntent = ResponseIntent.confirmSchedule;
        const response = await this.llmProvider.generateResponse(input, output);
        this.logger.info("llm.schedule.confirm.finished", { responseLength: response.length });
        return response;
    }

    

    // Validation gate between the LLM and the conversation state: every
    // extracted value must normalize into its parameter's declared value
    // space (categorical option / bounded number / ISO time) or it is dropped.
    private normalizeExtractedParams(
        input: StateMachineInput,
        params?: Record<string, string | number | null>
    ): Record<string, string | number | null> {
        if (!params) {
            return {};
        }

        const definitions = new Map(
            (input.paramDefinitions || []).map((definition) => [definition.paramName.toLowerCase(), definition])
        );
        if (definitions.size === 0) {
            return params;
        }

        const normalizedParams: Record<string, string | number | null> = {};
        for (const [paramName, rawValue] of Object.entries(params)) {
            const definition = definitions.get(paramName.toLowerCase());
            if (!definition) {
                this.logger.warn("llm.param.dropped_unknown", { paramName });
                continue;
            }

            const normalized = normalizeParamValue(definition, rawValue);
            if (!normalized.ok) {
                this.logger.warn("llm.param.dropped_invalid", {
                    paramName: definition.paramName,
                    paramType: definition.type,
                    reason: normalized.reason
                });
                continue;
            }

            normalizedParams[definition.paramName] = normalized.value;
        }

        return normalizedParams;
    }

    async askForMissingParams(input: StateMachineInput,output: StateMachineOutput): Promise<string>
    {
        this.logger.info("llm.response.generate.started", {
            currentState: input.currentState,
            conversationEvent: output.conversationEvent,
            conversationMode: output.conversationMode,
            responseIntent: output.responseIntent
        });
        const response = await this.llmProvider.generateResponse(input,output);
        this.logger.info("llm.response.generate.finished", {
            responseLength: response.length
        });
        return response;
    }

    async tryClosingConversation(input: StateMachineInput,output: StateMachineOutput): Promise<string>
    {
        // Implement logic to attempt closing the conversation, such as sending a closing message and updating the conversation context
        this.logger.info("llm.closing.generate.started", {
            currentState: input.currentState,
            conversationEvent: output.conversationEvent,
            conversationMode: output.conversationMode,
            responseIntent: output.responseIntent
        });
        const response = await this.llmProvider.getClosingMessage(
            output,
            input
        );
        this.logger.info("llm.closing.generate.finished", {
            responseLength: response.length
        });
        return response;
    }
    async clarify(input: StateMachineInput,cacheState: ConversationCacheState): Promise<string >
    {
        // Implement logic to ask the user for clarification, such as sending a message requesting more information and updating the conversation context
        return "Could you please clarify that?";
    }
    
}
