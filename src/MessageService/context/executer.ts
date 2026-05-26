import { ILlmProvider } from "../../llm/llmInterface";
import { Action, StateMachineInput, StateMachineOutput } from "../../dataClients/Types/stateMachineTypes";
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { ConversationStateMachine } from "./conversationSM";
import { LlmOutput } from "../../dataClients/Types/llmTypes";
import { ILogger, logger } from "../../logging/logger";


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
        const output = await this.llmProvider.extractEvents(input);
        this.logger.info("llm.event.extracted", {
            currentState: input.currentState,
            conversationEvent: output.conversationEvent,
            newConclusion: output.newConclusion,
            params: output.params
        });
        const stateBefore = cacheState.state;
        const actions = this.StateMachine.recognizeNewState(output, cacheState);
        this.logger.info("state.transition.recognized", {
            fromState: stateBefore,
            toState: cacheState.state,
            actions
        });
        return this.execute(input, output, cacheState, actions);
        
    }

    async execute(input: StateMachineInput,output: StateMachineOutput,cacheState: ConversationCacheState,actions: Action[]): Promise<LlmOutput>
    {
        let answer: string = "";
        for(const action of actions)
        {
            
            switch(action)
            {
                case Action.sendWelcomeMessage:
                    // Call method to send welcome message
                    answer = "starter";
                    break;
                case Action.askForParams:
                    // Call method to ask for missing parameters
                    answer = await this.askForMissingParams(input, output);
                    break;
                case Action.tryPacing:
                    // Call method to initiate pacing
                    answer = await this.handlePacing(output,input);
                    break;
                case Action.tryClosing:
                    // Call method to attempt closing the conversation
                    answer = await this.tryClosingConversation(input, output);
                    break;
                case Action.endConversation:
                    // Call method to end the conversation
                    answer = "ender";
                    break;
                case Action.applyParams:
                    // Call method to apply new parameters to the conversation context
                    if(output.params === undefined)
                    {
                        this.logger.warn("params.apply.skipped", { reason: "missing_params" });
                        break;
                    }
                    this.applyParams(output.params, cacheState);
                    break;
                case Action.escalateToHuman:
                    answer = "escalate";
                    break;
                case Action.clarify:
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

    async handlePacing(output: StateMachineOutput,input: StateMachineInput): Promise<string>
    {
        
        const pacingMessage = await this.llmProvider.getPacingMessage(output,input);
        this.logger.info("llm.pacing.generated", {
            responseLength: pacingMessage.length,
            conversationEvent: output.conversationEvent
        });
        // Implement logic to send pacing message to the user, such as through an API call or messaging service
        return pacingMessage;
        
    }


    applyParams(params: Record<string, string | number | null>,cacheState: ConversationCacheState): void
    {
        // Implement logic to apply new parameters to the conversation context, such as updating the cacheState object with new values
        for (const [key, value] of Object.entries(params)) {
            if(value === null || value === undefined || value === "")
            {
                continue;
            }
            cacheState.collectedParams[key] = value;
        }
        this.logger.info("params.applied", {
            collectedParams: cacheState.collectedParams
        });
    }


    async askForMissingParams(input: StateMachineInput,output: StateMachineOutput): Promise<string>
    {
        
        return await this.llmProvider.generateResponse(input,output);
    }

    async tryClosingConversation(input: StateMachineInput,output: StateMachineOutput): Promise<string>
    {
        // Implement logic to attempt closing the conversation, such as sending a closing message and updating the conversation context
        return await this.llmProvider.getClosingMessage(
            output,
            input
        );
    }
    async clarify(input: StateMachineInput,cacheState: ConversationCacheState): Promise<string >
    {
        // Implement logic to ask the user for clarification, such as sending a message requesting more information and updating the conversation context
        return "Could you please clarify that?";
    }
    
}
