import { LlmInput,LlmOutput } from "../dataClients/Types/llmTypes";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";
import { ConversationEvent } from "../dataClients/Types/stateMachineTypes";


export function buildMessagePrompt(output:StateMachineOutput, input: StateMachineInput): string
{
        return `
You are a business assistant.

CURRENT CONVERSATION STATE: ${input.currentState}
COLLECTED PARAMETERS: ${JSON.stringify(input.collectedParams)}
CONVERSATION HISTORY:
${input.lastMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}
LATEST USER MESSAGE: "${input.messageContent}"
RECENT EVENT: "${output.conversationEvent}"
Based on the conversation history and missing parameters, generate a solid short and appropriate response to the user in order to collect one of the missing parameters`;
}

export function buildPacingPrompt(input: StateMachineInput, output: StateMachineOutput): string {
    return `
    You are a helpful assistant that provides pacing messages to users who are in the "pacing" state of a conversation. Your goal is to craft empathetic and engaging messages that encourage the user to continue the conversation while they process information or consider their options.
    CURRENT CONVERSATION STATE: ${input.currentState}
    COLLECTED PARAMETERS: ${JSON.stringify(input.collectedParams, null, 2)}
    CONVERSATION HISTORY:
    ${input.lastMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}
    LATEST USER MESSAGE: "${input.messageContent}"
    RECENT EVENT: "${output.conversationEvent}"`;
}

export function buildEventPrompt(input: StateMachineInput): string {
    return `You are an expert conversation analyst for a business chatbot. Your task is to analyze the current conversation state and user message to determine the next conversation event and extract any new parameters.

CURRENT CONVERSATION STATE: ${input.currentState}
COLLECTED PARAMETERS: ${JSON.stringify(input.collectedParams, null, 2)}

CONVERSATION HISTORY:
${input.lastMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

LATEST USER MESSAGE: "${input.messageContent}"

INSTRUCTIONS:
1. Analyze if the user is expressing concern, satisfaction, or wants to end the conversation
2. Check if all required business parameters have been collected
3. Determine the appropriate next event based on the state machine logic

EVENT DEFINITIONS:
- "clientConcern": User expresses dissatisfaction, confusion, or needs help
- "tryEnding": User seems ready to conclude (says "thanks", "that's all", etc.)
- "finishedPacing": User has been given time to process and is ready to continue
- "ended": Conversation should completely end
- "failure": Something went wrong or unclear intent
- "startConversation": New conversation just beginning

STATE MACHINE LOGIC:
- If in "collecting" state and user shows concern → trigger "clientConcern"
- If all parameters collected and user seems done → trigger "tryEnding"  
- If user acknowledges pacing period is over → trigger "finishedPacing"

EXAMPLES:

Example 1 - User Concern:
Input: "This pricing doesn't make sense to me"
Output: {"conversationEvent": "clientConcern", "newConclusion": "User is confused about pricing"}

Example 2 - Ready to End:
Input: "Thanks for the information, I think that's all I need"
Output: {"conversationEvent": "tryEnding", "newConclusion": "User indicates conversation can end"}

Example 3 - Parameter Extraction:
Input: "My budget is $5000 and I need this done by Friday"
Output: {"conversationEvent": "finishedPacing", "newConclusion": "User provided budget and timeline", "params": {"budget": 5000, "deadline": "Friday"}}

Respond with valid JSON only:
{
  "conversationEvent": "updateParams|clientConcern|tryEnding|finishedPacing|ended|failure|startConversation",
  "newConclusion": "Brief explanation of your analysis include the messages in the conclusion",
  "params": {"paramName": "extractedValue"} // Only include if new parameters found
}`;
}

export function parseEventResponse(text: string): StateMachineOutput {
    try {
        const json = JSON.parse(cleanJson(text));
        
        // Validate the event is a known enum value
        if (!Object.values(ConversationEvent).includes(json.conversationEvent)) {
            console.warn(`Invalid event: ${json.conversationEvent}`);
            return {
                conversationEvent: ConversationEvent.failure,
                newConclusion: "Failed to determine valid event"
            };
        }
        
        return {
            conversationEvent: json.conversationEvent,
            newConclusion: json.newConclusion || "",
            params: json.params || {}
        };
    } catch (error) {
        console.error("Failed to parse event response:", error);
        return {
            conversationEvent: ConversationEvent.failure,
            newConclusion: "Failed to parse LLM response"
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