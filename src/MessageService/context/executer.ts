import { ILlmProvider } from "../../llm/llmInterface";
import { BotMsg, StateMachineInput, StateMachineOutput } from "../../dataClients/Types/stateMachineTypes";
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { ConversationStateMachine } from "./conversationSM";
import { LlmOutput } from "../../dataClients/Types/llmTypes";
import { normalizeParamValue } from "../../dataClients/Types/paramTypes";
import { ILogger, logger } from "../../logging/logger";
import { parseFollowUpResponse } from "../../llm/promptHandler";


export class Executer{
    private llmProvider: ILlmProvider;
    private StateMachine: ConversationStateMachine;
    private logger: ILogger;

    constructor(llmProvider: ILlmProvider, loggerInstance: ILogger = logger.child({ component: "Executer" }))
    {
        this.llmProvider = llmProvider;
        this.logger = loggerInstance;
        this.StateMachine = new ConversationStateMachine(this.logger.child({ component: "ConversationStateMachine" }));
    }

    async prepareAndExecute(input: StateMachineInput,cacheState: ConversationCacheState) :Promise<LlmOutput>
    {        
        this.logger.info("llm.event.extract.started", {
            currentState: input.currentState,
            lastMessagesCount: input.lastMessages.length,
            collectedParamNames: Object.keys(input.collectedParams)
        });
        const output = await this.llmProvider.extractEvents(input);
        output.params = this.normalizeExtractedParams(input, output.params);
        this.logger.info("llm.event.extracted", {
            currentState: input.currentState,
            conversationEvent: output.conversationEvent,
            conversationMode: output.conversationMode,
            responseIntent: output.responseIntent,
            newConclusion: output.newConclusion,
            params: output.params
        });
        const stateBefore = cacheState.state;
        const NextMessage = this.StateMachine.recognizeNewState(output, cacheState);
        this.logger.info("state.transition.recognized", {
            fromState: stateBefore,
            toState: cacheState.state,
            actions: NextMessage   
        });
        return this.execute(input, output, cacheState, NextMessage);
        
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

    async execute(input: StateMachineInput,output: StateMachineOutput,cacheState: ConversationCacheState,actions: BotMsg[]): Promise<LlmOutput>
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
                default:
                    this.logger.warn("action.unknown", { action });
            }
        }
        return {
            response: answer || "Actions executed. Check logs for details.",
            collectedParams: cacheState.collectedParams
            

        };
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
