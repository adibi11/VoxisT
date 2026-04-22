
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { Action, ConversationEvent } from "../../dataClients/Types/stateMachineTypes";
import { StateMachineInput, StateMachineOutput ,ConversationState} from "../../dataClients/Types/stateMachineTypes";
import { ILlmProvider } from "../../llm/llmInterface";
export  class ConversationStateMachine
{
    public Actions: Action[] = [];
    
    
    recognizeNewState(output: StateMachineOutput, input: StateMachineInput): ConversationState
    {
        // Implement rule based event recognition based on the input parameters and message content
        switch(input.currentState)
        {
            case ConversationState.start:
                this.Actions.push(Action.sendWelcomeMessage);
                return ConversationState.collecting;
            case ConversationState.collecting:
                if(output.conversationEvent === ConversationEvent.concern)
                {
                    this.addAction(Action.tryPacing);
                    if(this.checkAllParamsCollected(input.collectedParams, output.params))
                    {
                        this.addAction(Action.applyParams);
                    }
                    return ConversationState.pacing;
                }
                if(this.checkAllParamsCollected(input.collectedParams, output.params))
                {
                    this.addAction(Action.applyParams);
                    this.addAction(Action.tryClosing);
                    return ConversationState.closing;
                }
                else{
                    return ConversationState.collecting;
                }

            case ConversationState.closing:
                if(output.conversationEvent === ConversationEvent.concern)
                {
                    this.addAction(Action.tryPacing);
                    return ConversationState.pacing;
                }
                if(output.conversationEvent === ConversationEvent.updateParams)
                {
                    this.addAction(Action.applyParams);
                    return ConversationState.collecting;
                }
                this.addAction(Action.endConversation);
                return ConversationState.ended;
            case ConversationState.pacing:
                if(output.conversationEvent === ConversationEvent.concern)
                {
                    this.addAction(Action.tryPacing);
                    return ConversationState.pacing;
                }
                
                if(output.conversationEvent === ConversationEvent.finishedPacing)
                {
                    if(this.checkAllParamsCollected(input.collectedParams, output.params))
                    {
                        this.addAction(Action.applyParams);
                        this.addAction(Action.tryClosing);
                        return ConversationState.closing;
                    }
                    this.addAction(Action.tryClosing);
                    return ConversationState.collecting;
                }
                break;
            case ConversationState.ended:
                this.addAction(Action.endConversation);
                return ConversationState.ended;
            case ConversationState.failure:
                this.addAction(Action.escalateToHuman);
                return ConversationState.failure;


        }
        return input.currentState;
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