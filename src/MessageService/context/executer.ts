import { ILlmProvider } from "../../llm/llmInterface";
import { Action, StateMachineInput, StateMachineOutput } from "../../dataClients/Types/stateMachineTypes";
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { ConversationStateMachine } from "./conversationSM";
import { OutputItems } from "openai/resources/evals/runs.mjs";
import { LlmOutput } from "../../dataClients/Types/llmTypes";


export class Executer{
    private llmProvider: ILlmProvider;
    private StateMachine: ConversationStateMachine;

    constructor(llmProvider: ILlmProvider)
    {
        this.llmProvider = llmProvider;
        this.StateMachine = new ConversationStateMachine();
    }

    async prepareAndExecute(input: StateMachineInput,cacheState: ConversationCacheState) :Promise<LlmOutput>
    {        
        const output = await this.llmProvider.extractEvents(input);
        console.log("LLM Output:", output);
        const actions = this.StateMachine.recognizeNewState(output, cacheState);
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
                    answer = await this.askForMissingParams(input, cacheState);
                    break;
                case Action.tryPacing:
                    // Call method to initiate pacing
                    answer = await this.handlePacing(output,input,cacheState);
                    break;
                case Action.tryClosing:
                    // Call method to attempt closing the conversation
                    answer = await this.tryClosingConversation(input, cacheState);
                    break;
                case Action.endConversation:
                    // Call method to end the conversation
                    answer = "ender";
                    break;
                case Action.applyParams:
                    // Call method to apply new parameters to the conversation context
                    if(output.params === undefined)
                    {
                        console.warn("No new parameters to apply.");
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
                    console.warn(`Unknown action: ${action}`);
            }
        }
        return {
            response: answer || "Actions executed. Check logs for details.",
            collectedParams: cacheState.collectedParams
            

        };
    }

    async handlePacing(output: StateMachineOutput,input: StateMachineInput,cacheState: ConversationCacheState): Promise<string>
    {
        
        const pacingMessage = await this.llmProvider.getPacingMessage(output,input);
        console.log("Pacing message:", pacingMessage);
        // Implement logic to send pacing message to the user, such as through an API call or messaging service
        return pacingMessage;
        
    }


    applyParams(params: Record<string, string | number | null>,cacheState: ConversationCacheState): void
    {
        // Implement logic to apply new parameters to the conversation context, such as updating the cacheState object with new values
        for (const [key, value] of Object.entries(params)) {
            cacheState.collectedParams[key] = value;
        }
        console.log("Updated cache state with new params:", cacheState.collectedParams);
    }


    async askForMissingParams(input: StateMachineInput,cacheState: ConversationCacheState): Promise<string>
    {
        // Implement logic to ask the user for any missing parameters, such as through an API call or messaging service
        return "Please provide the missing information.";
    }

    async tryClosingConversation(input: StateMachineInput,cacheState: ConversationCacheState): Promise<string>
    {
        // Implement logic to attempt closing the conversation, such as sending a closing message and updating the conversation context
        return "Attempting to close conversation.";
    }
    async clarify(input: StateMachineInput,cacheState: ConversationCacheState): Promise<string >
    {
        // Implement logic to ask the user for clarification, such as sending a message requesting more information and updating the conversation context
        return "Could you please clarify that?";
    }
    
}