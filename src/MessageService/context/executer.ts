import { ILlmProvider } from "../../llm/llmInterface";
import { Action, StateMachineInput, StateMachineOutput } from "../../dataClients/Types/stateMachineTypes";
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { ConversationStateMachine } from "./conversationSM";


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
        const newState = this.StateMachine.recognizeNewState(output, input);}

    async execute(output: StateMachineOutput,cacheState: ConversationCacheState,actions: Action[]): Promise<void>
    {
        for(const action of actions)
        {
            switch(action)
            {
                case Action.sendWelcomeMessage:
                    // Call method to send welcome message
                    break;
                case Action.askForParams:
                    // Call method to ask for missing parameters
                    break;
                case Action.tryPacing:
                    // Call method to initiate pacing
                    break;
                case Action.tryClosing:
                    // Call method to attempt closing the conversation
                    break;
                case Action.endConversation:
                    // Call method to end the conversation
                    break;
                case Action.applyParams:
                    // Call method to apply new parameters to the conversation context
                    break;
                case Action.escalateToHuman:
                    // Call method to escalate the conversation to a human agent
                    break;
                case Action.clarify:
                    // Call method to ask user for clarification
                    break;
            }
        }
    }
}