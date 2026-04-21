import { LlmInput,LlmOutput } from "../dataClients/Types/llmTypes";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";
import { ConversationEvent } from "../dataClients/Types/stateMachineTypes";
export function buildMessagePrompt(input:LlmInput)
{
        return `
You are a business assistant.

Known parameters:
${JSON.stringify(input.collectedParams)}

Conversation:
${input.messages.map(m => `${m.role}: ${m.content}`).join("\n")}

Respond in JSON:
{
  "response": "...",
  "params": { "paramName": "value" }
}
`;
}

export function buildEventPrompt(input: StateMachineInput)
{
        return `
You are an event extractor.
Known parameters:
${JSON.stringify(input.collectedParams)}
Conversation:
${input.lastMessages.map(m => `${m.role}: ${m.content}`).join("\n")}
User message:
${input.messageContent}
Based on the conversation and the user message, extract any new events that should be triggered and any new parameters that can be collected. Respond in JSON format like this:
next event:
The state is based in the parameters that have been collected.
conclusion: a mid conversation conclusion for the current messages
{
  "conversationEvent": concern | finishedPacing | tryEnding | ended | failure|startConversation,
  "newConclusion": "Your conclusion here",
  "params": { "paramName": "value" }
}
`;
}

export function parseEventResponse(text: string): StateMachineOutput {
    try {
        const json = JSON.parse(cleanJson(text));

        return {
            conversationEvent: json.conversationEvent,
            newConclusion: json.newConclusion
        };
    } catch {
        return {
            conversationEvent: ConversationEvent.failure,
            newConclusion: ""
        };
    }
}
        

export function parseResponse(text: string): LlmOutput {
    try {
        const json = JSON.parse(cleanJson(text));

        return {
            response: json.response,
            collectedParams: json.params || {}
        };
    } catch {
        return {
            response: text,
            collectedParams:{}
        };
    }
}

function cleanJson(text: string): string {
    return text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
}