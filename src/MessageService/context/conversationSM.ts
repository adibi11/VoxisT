
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { BotMsg, ConversationEvent } from "../../dataClients/Types/stateMachineTypes";
import { StateMachineOutput ,ConversationState} from "../../dataClients/Types/stateMachineTypes";
import { ILogger, logger } from "../../logging/logger";
export  class ConversationStateMachine
{
    private logger: ILogger;

    constructor(loggerInstance: ILogger = logger.child({ component: "ConversationStateMachine" }))
    {
        this.logger = loggerInstance;
    }
    
    
    
    recognizeNewState(output: StateMachineOutput, cache: ConversationCacheState): BotMsg[]
    {
        // Implement rule based event recognition based on the input parameters and message content
        const NextMessage: BotMsg[] = [];
        
        switch(cache.state)
        {
            case ConversationState.start:
                this.nextMsg(BotMsg.sendWelcomeMessage, NextMessage);
                cache.state = ConversationState.collecting;
                break;
            case ConversationState.collecting:
                if(output.conversationEvent === ConversationEvent.failure)
                {
                    this.nextMsg(BotMsg.escalateToHuman, NextMessage);
                    cache.state = ConversationState.failure;
                    break;
                }

                if(this.hasValidParams(output.params))
                {
                    this.applyParamsToCache(cache, output.params);
                }

                if(this.checkAllParamsCollected(cache.collectedParams, output.params))
                {
                    this.nextMsg(BotMsg.tryClosing, NextMessage);
                    cache.state = ConversationState.closing;
                    
                }
                else{
                    this.nextMsg(BotMsg.askForParams, NextMessage);
                    cache.state = ConversationState.collecting;
                }
                break;

            case ConversationState.closing:
                if(output.conversationEvent === ConversationEvent.tryEnding || output.conversationEvent === ConversationEvent.ended)
                {
                    this.nextMsg(BotMsg.endConversation, NextMessage);
                    cache.state = ConversationState.ended;
                    break;
                }

                if(output.conversationEvent === ConversationEvent.failure)
                {
                    this.nextMsg(BotMsg.escalateToHuman, NextMessage);
                    cache.state = ConversationState.failure;
                    break;
                }

                if(this.hasValidParams(output.params))
                {
                    
                    this.applyParamsToCache(cache, output.params);
                }

                if(this.checkAllParamsCollected(cache.collectedParams, output.params))
                {
                    this.nextMsg(BotMsg.tryClosing, NextMessage);
                    cache.state = ConversationState.closing;
                    break;
                }

                this.nextMsg(BotMsg.askForParams, NextMessage);
                cache.state = ConversationState.collecting;
                break;
            case ConversationState.ended:
                this.nextMsg(BotMsg.ignore, NextMessage);
                cache.state = ConversationState.ended;
                break;
            
            default:
                this.logger.warn("state.unrecognized", { state: cache.state });
                cache.state = ConversationState.failure;
                this.nextMsg(BotMsg.escalateToHuman, NextMessage);
        }
        return NextMessage;
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


    applyParamsToCache(cache: ConversationCacheState, params?: Record<string, string | number | null>): void
    {
        if(!params) return;

        for(const [key, value] of Object.entries(params))
        {
            if(value !== null && value !== undefined && value !== "")
            {
                cache.collectedParams[key] = value;
            }
        }
    }

    nextMsg(action: BotMsg, NextMessage: BotMsg[])
    {
        if(!NextMessage.includes(action))
        {
            NextMessage.push(action);
        }
    }
}
