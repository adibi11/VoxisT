
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { Action, ConversationEvent } from "../../dataClients/Types/stateMachineTypes";
import { StateMachineOutput ,ConversationState} from "../../dataClients/Types/stateMachineTypes";
import { ILogger, logger } from "../../logging/logger";
export  class ConversationStateMachine
{
    private logger: ILogger;

    constructor(loggerInstance: ILogger = logger.child({ component: "ConversationStateMachine" }))
    {
        this.logger = loggerInstance;
    }
    
    
    
    recognizeNewState(output: StateMachineOutput, cache: ConversationCacheState): Action[]
    {
        // Implement rule based event recognition based on the input parameters and message content
        const Actions: Action[] = [];
        
        switch(cache.state)
        {
            case ConversationState.start:
                this.addAction(Action.sendWelcomeMessage, Actions);
                cache.state = ConversationState.collecting;
                break;
            case ConversationState.collecting:
                if(output.conversationEvent === ConversationEvent.concern)
                {
                    if(this.hasValidParams(output.params))
                    {
                        this.addAction(Action.applyParams, Actions);
                    }
                    this.addAction(Action.tryPacing, Actions);
                    cache.state = ConversationState.pacing;
                    break;
                }
                
                if(this.hasValidParams(output.params))
                {
                    this.addAction(Action.applyParams, Actions);
                }

                if(this.checkAllParamsCollected(cache.collectedParams, output.params))
                {
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
                    if(this.hasValidParams(output.params))
                    {
                        this.addAction(Action.applyParams, Actions);
                    }
                    this.addAction(Action.tryPacing, Actions);
                    cache.state = ConversationState.pacing;

                    break;
                }
                if(output.conversationEvent === ConversationEvent.updateParams)
                {
                    if(this.hasValidParams(output.params))
                    {
                        this.addAction(Action.applyParams, Actions);
                    }
                    cache.state = ConversationState.collecting;
                    break;
                }
                this.addAction(Action.endConversation, Actions);
                cache.state = ConversationState.ended;
                break;
            case ConversationState.pacing:
                if(output.conversationEvent === ConversationEvent.concern)
                {
                    if(this.hasValidParams(output.params))
                    {
                        this.addAction(Action.applyParams, Actions);
                    }
                    this.addAction(Action.tryPacing, Actions);
                    cache.state = ConversationState.pacing;

                    break;
                }
                
                if(output.conversationEvent === ConversationEvent.finishedPacing)
                {
                    if(this.hasValidParams(output.params))
                    {
                        this.addAction(Action.applyParams, Actions);
                    }

                    if(this.checkAllParamsCollected(cache.collectedParams, output.params))
                    {
                        this.addAction(Action.tryClosing, Actions);
                        cache.state = ConversationState.closing;

                        break;
                    }
                    this.addAction(Action.askForParams, Actions);
                    cache.state = ConversationState.collecting;
                    break;
                }
                break;
            case ConversationState.ended:
                this.addAction(Action.ignore, Actions);
                cache.state = ConversationState.ended;
                break;
            
            default:
                this.logger.warn("state.unrecognized", { state: cache.state });
                cache.state = ConversationState.failure;
                this.addAction(Action.escalateToHuman, Actions);
        }
        return Actions;
    }

    checkAllParamsCollected(collectedParams: Record<string, string | number | null>, newParams?: Record<string, string | number | null>): boolean
    {
        const mergedParams = {
            ...collectedParams,
            ...(newParams || {})
        };

        const requiredParamNames = Object.keys(collectedParams);
        if(requiredParamNames.length === 0) return true;

        for(const key of requiredParamNames)
        {
            if (mergedParams[key] === null || mergedParams[key] === undefined || mergedParams[key] === "")
            {
                return false;
            }

        }
        return true;
    }

    hasValidParams(params?: Record<string, string | number | null>): boolean
    {
        return Object.values(params || {}).some((value) =>
            value !== null && value !== undefined && value !== ""
        );
    }

    addAction(action: Action, Actions: Action[])
    {
        if(!Actions.includes(action))
        {
            Actions.push(action);
        }
    }
}
