
import { Action, ConversationEvent } from "../../dataClients/Types/stateMachineTypes";
import { StateMachineInput, StateMachineOutput ,ConversationState} from "../../dataClients/Types/stateMachineTypes";
import { ILlmProvider } from "../../llm/llmInterface";
export  class ConversationStateMachine
{
    public Actions: Action[] = [];
    constructor(private llmProvider: ILlmProvider) {}

    async extractEvents(input: StateMachineInput): Promise<StateMachineOutput>
    {
        return await this.llmProvider.extractEvents(input);
    }

    recognizeNewState(output: StateMachineOutput, input: StateMachineInput): ConversationState
    {
        // Implement rule based event recognition based on the input parameters and message content
        switch(input.currentState)
        {
            case ConversationState.start:
                this.Actions.push(Action.sendWelcomeMessage);
                break;
            case ConversationState.collecting:
                if(output.conversationEvent === ConversationEvent.concern)
                {
                    this.addAction(Action.askForParams);
                    if(this.checkAllParamsCollected(input.collectedParams, output.params))
                    {
                        this.addAction(Action.applyParams);
                    }
                    return ConversationState.pacing;
                }
                if(this.checkAllParamsCollected(input.collectedParams, output.params))
                {
                    this.addAction(Action.askForParams);
                    return ConversationState.closing;
                }
                else{
                    return ConversationState.closing;
                }

            case ConversationState.closing:
                return ConversationState.ended;

        }
        return ConversationState.failure;
    }

    checkAllParamsCollected(collectedParams: Record<string, string | number | null>, newParams?: Record<string, string | number | null>): boolean
    {
        if(!newParams) return false;
        for(const key in newParams)
        {
            if (collectedParams[key] === null || collectedParams[key] === undefined)
            {
                return false;
            }

        }
        return true;
    }
    addAction(action: Action)
    {
        if(!this.Actions.includes(action))
        {
            this.Actions.push(action);
        }
    }
}