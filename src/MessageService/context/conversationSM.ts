
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { Action, ConversationEvent } from "../../dataClients/Types/stateMachineTypes";
import { StateMachineInput, StateMachineOutput ,ConversationState} from "../../dataClients/Types/stateMachineTypes";
import { ILlmProvider } from "../../llm/llmInterface";
export  class ConversationStateMachine
{
    
    
    
    
    recognizeNewState(output: StateMachineOutput, cache: ConversationCacheState): Action[]
    {
        // Implement rule based event recognition based on the input parameters and message content
        const Actions: Action[] = [];
        
        switch(cache.state)
        {
            case ConversationState.start:
                this.addAction(Action.sendWelcomeMessage, Actions);
                break;
            case ConversationState.collecting:
                if(output.conversationEvent === ConversationEvent.concern)
                {
                    this.addAction(Action.tryPacing, Actions);
                    if(this.checkAllParamsCollected(cache.collectedParams, output.params))
                    {
                        this.addAction(Action.applyParams, Actions);
                    }
                    cache.state = ConversationState.pacing;
                    break;
                }
                
                if(this.checkAllParamsCollected(cache.collectedParams, output.params))
                {
                    this.addAction(Action.applyParams, Actions);
                    this.addAction(Action.tryClosing, Actions);
                    cache.state = ConversationState.closing;
                    
                }
                else{
                    this.addAction(Action.askForParams, Actions);
                    cache.state = ConversationState.collecting;
                }
                break;

            case ConversationState.closing:
                if(output.conversationEvent === ConversationEvent.concern)
                {
                    this.addAction(Action.tryPacing, Actions);
                    cache.state = ConversationState.pacing;

                    break;
                }
                if(output.conversationEvent === ConversationEvent.updateParams)
                {
                    this.addAction(Action.applyParams, Actions);
                    cache.state = ConversationState.collecting;
                    break;
                }
                this.addAction(Action.endConversation, Actions);
                cache.state = ConversationState.ended;
                break;
            case ConversationState.pacing:
                if(output.conversationEvent === ConversationEvent.concern)
                {
                    this.addAction(Action.tryPacing, Actions);
                    cache.state = ConversationState.pacing;

                    break;
                }
                
                if(output.conversationEvent === ConversationEvent.finishedPacing)
                {
                    if(this.checkAllParamsCollected(cache.collectedParams, output.params))
                    {
                        this.addAction(Action.applyParams, Actions);
                        this.addAction(Action.tryClosing, Actions);
                        cache.state = ConversationState.closing;

                        break;
                    }
                    this.addAction(Action.tryClosing, Actions);
                    cache.state = ConversationState.collecting;
                    break;
                }
                break;
            case ConversationState.ended:
                this.addAction(Action.ignore, Actions);
                cache.state = ConversationState.ended;
                break;
            
            default:
                console.warn(`Unrecognized conversation state: ${cache.state}`);
                cache.state = ConversationState.failure;
                this.addAction(Action.escalateToHuman, Actions);
        }
        return Actions;
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
    addAction(action: Action, Actions: Action[])
    {
        if(!Actions.includes(action))
        {
            Actions.push(action);
        }
    }
}