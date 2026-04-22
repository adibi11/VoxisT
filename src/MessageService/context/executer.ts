import { ILlmProvider } from "../../llm/llmInterface";
import { Action, StateMachineInput, StateMachineOutput } from "../../dataClients/Types/stateMachineTypes";
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { ConversationStateMachine } from "./conversationSM";
import { OutputItems } from "openai/resources/evals/runs.mjs";


export class Executer{
    private llmProvider: ILlmProvider;
    private StateMachine: ConversationStateMachine;

    constructor(llmProvider: ILlmProvider)
    {
        this.llmProvider = llmProvider;
        this.StateMachine = new ConversationStateMachine();
    }

    async prepareAndExecute(input: StateMachineInput,cacheState: ConversationCacheState)
    {        
        const output = await this.llmProvider.extractEvents(input);
        console.log("LLM Output:", output);
        const newState = this.StateMachine.recognizeNewState(output, cacheState);
    }

    async execute(input: StateMachineInput,output: StateMachineOutput,cacheState: ConversationCacheState,actions: Action[]): Promise<void>
    {
        for(const action of actions)
        {
            switch(action)
            {
                case Action.sendWelcomeMessage:
                    // Call method to send welcome message
                    await this.sendWelcomeMessage(input);
                    break;
                case Action.askForParams:
                    // Call method to ask for missing parameters
                    break;
                case Action.tryPacing:
                    // Call method to initiate pacing
                    await this.handlePacing(output,input,cacheState);
                    break;
                case Action.tryClosing:
                    // Call method to attempt closing the conversation
                    break;
                case Action.endConversation:
                    // Call method to end the conversation
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
                    // Call method to escalate the conversation to a human agent
                    break;
                case Action.clarify:
                    // Call method to ask user for clarification
                    break;
                default:
                    console.warn(`Unknown action: ${action}`);
            }
        }
    }

    async handlePacing(output: StateMachineOutput,input: StateMachineInput,cacheState: ConversationCacheState): Promise<string>
    {
        
        const pacingMessage = await this.llmProvider.getPacingMessage(output,input);
        console.log("Pacing message:", pacingMessage);
        // Implement logic to send pacing message to the user, such as through an API call or messaging service
        return pacingMessage;
        
    }

    async handleEscalation(input: StateMachineInput,cacheState: ConversationCacheState): Promise<void>
    {
        // Implement any necessary logic for handling escalation, such as notifying a human agent or updating the conversation context
    }

    applyParams(params: Record<string, string | number | null>,cacheState: ConversationCacheState): void
    {
        // Implement logic to apply new parameters to the conversation context, such as updating the cacheState object with new values
        for (const [key, value] of Object.entries(params)) {
            cacheState.collectedParams[key] = value;
        }
        console.log("Updated cache state with new params:", cacheState.collectedParams);
    }

    async sendWelcomeMessage(input: StateMachineInput): Promise<void>
    {
        // Implement logic to send a welcome message to the user, such as through an API call or messaging service
    }
    
}