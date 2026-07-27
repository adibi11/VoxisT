
import { ConversationCacheState } from "../../dataClients/Types/messageTypes";
import { isClientNameParam } from "../../dataClients/Types/clientNameParam";
import { BotMsg, ConversationEvent } from "../../dataClients/Types/stateMachineTypes";
import { StateMachineOutput ,ConversationState} from "../../dataClients/Types/stateMachineTypes";
import { ILogger, logger } from "../../logging/logger";
// The FSM, not the LLM, decides when to stop pursuing a callback.
export const MAX_SCHEDULING_ATTEMPTS = 3;

export type StateMachineOptions = {
    schedulingEnabled?: boolean;
};

export  class ConversationStateMachine
{
    private logger: ILogger;

    constructor(loggerInstance: ILogger = logger.child({ component: "ConversationStateMachine" }))
    {
        this.logger = loggerInstance;
    }



    recognizeNewState(output: StateMachineOutput, cache: ConversationCacheState, options: StateMachineOptions = {}): BotMsg[]
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
                    // Parameters are complete at the moment of highest engagement:
                    // propose a callback before moving toward closing.
                    if(options.schedulingEnabled)
                    {
                        this.nextMsg(BotMsg.proposeSchedule, NextMessage);
                        cache.state = ConversationState.scheduling;
                        cache.schedulingAttempts = 1;
                        break;
                    }

                    this.nextMsg(BotMsg.tryClosing, NextMessage);
                    cache.state = ConversationState.closing;

                }
                else{
                    this.nextMsg(BotMsg.askForParams, NextMessage);
                    cache.state = ConversationState.collecting;
                }
                break;

            case ConversationState.scheduling:
                this.recognizeSchedulingState(output, cache, NextMessage);
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

                // Late agreement: the user decided to schedule after all
                // ("actually, can you call me tomorrow at 3?").
                if(options.schedulingEnabled &&
                    output.conversationEvent === ConversationEvent.schedulingAgreed &&
                    output.scheduledTime)
                {
                    cache.scheduledFor = output.scheduledTime;
                    this.nextMsg(BotMsg.confirmSchedule, NextMessage);
                    // Confirming a callback is not a terminal outcome - fold
                    // straight back into the normal closing flow so the
                    // conversation stays open instead of dead-ending.
                    cache.state = ConversationState.closing;
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

    private recognizeSchedulingState(
        output: StateMachineOutput,
        cache: ConversationCacheState,
        NextMessage: BotMsg[]
    ): void
    {
        if(output.conversationEvent === ConversationEvent.failure)
        {
            this.nextMsg(BotMsg.escalateToHuman, NextMessage);
            cache.state = ConversationState.failure;
            return;
        }

        if(output.conversationEvent === ConversationEvent.tryEnding || output.conversationEvent === ConversationEvent.ended)
        {
            this.nextMsg(BotMsg.endConversation, NextMessage);
            cache.state = ConversationState.ended;
            return;
        }

        // Params can still arrive mid-negotiation ("it's for my mother, her
        // name is Ruth") - keep applying them.
        if(this.hasValidParams(output.params))
        {
            this.applyParamsToCache(cache, output.params);
        }

        // Agreement only counts with a concrete, validated time.
        if(output.conversationEvent === ConversationEvent.schedulingAgreed && output.scheduledTime)
        {
            cache.scheduledFor = output.scheduledTime;
            this.nextMsg(BotMsg.confirmSchedule, NextMessage);
            // Confirming a callback is not a terminal outcome - fold
            // straight back into the normal closing flow so the
            // conversation stays open instead of dead-ending.
            cache.state = ConversationState.closing;
            return;
        }

        // A hesitant client is never pushed on scheduling: decline and
        // concern both exit to the normal closing flow immediately.
        if(output.conversationEvent === ConversationEvent.schedulingDeclined ||
            output.conversationEvent === ConversationEvent.concern)
        {
            this.nextMsg(BotMsg.tryClosing, NextMessage);
            cache.state = ConversationState.closing;
            return;
        }

        // Anything else (agreement without a time, questions, small talk)
        // keeps negotiating - up to the deterministic attempt cap.
        const attempts = (cache.schedulingAttempts ?? 0) + 1;
        cache.schedulingAttempts = attempts;
        if(attempts > MAX_SCHEDULING_ATTEMPTS)
        {
            this.logger.info("scheduling.attempts.exhausted", {
                conversationId: cache.conversationId,
                attempts
            });
            this.nextMsg(BotMsg.tryClosing, NextMessage);
            cache.state = ConversationState.closing;
            return;
        }

        this.nextMsg(BotMsg.proposeSchedule, NextMessage);
        cache.state = ConversationState.scheduling;
    }

    checkAllParamsCollected(collectedParams: Record<string, string | number | null>, newParams?: Record<string, string | number | null>): boolean
    {
        const mergedParams = {
            ...collectedParams,
            ...(newParams || {})
        };

        const requiredParamNames = Object.keys(collectedParams)
            .filter((paramName) => !isClientNameParam(paramName));
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
            if(key in cache.collectedParams && value !== null && value !== undefined && value !== "")
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
