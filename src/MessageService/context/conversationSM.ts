
import { ConversationEvent } from "../../dataClients/Types/stateMachineTypes";
import { StateMachineInput, StateMachineOutput } from "../../dataClients/Types/stateMachineTypes";
import { ILlmProvider } from "../../llm/llmInterface";
export  class ConversationStateMachine
{
    
    constructor(private llmProvider: ILlmProvider) {}

    async extractEvents(input: StateMachineInput): Promise<StateMachineOutput>
    {
        return await this.llmProvider.extractEvents(input);
    }

    recognizeEvents(output: StateMachineOutput, currentState: "start" | "collecting" | "closing"|"failure"): ConversationEvent
    {
        // Implement rule based event recognition based on the input parameters and message content
        switch(currentState)
        {
            case "start":
                return ConversationEvent.startConversation;
                

            case "collecting":
                if(output.conversationEvent === ConversationEvent.extractedParams)
                    return ConversationEvent.extractedParams;
                if(output.conversationEvent === ConversationEvent.concern)
                    return ConversationEvent.concern;
                if(output.conversationEvent === ConversationEvent.tryEnding)
                    return ConversationEvent.tryEnding;
                

            case "closing":
                return ConversationEvent.ended;

        }
        return ConversationEvent.failure;
    }
}