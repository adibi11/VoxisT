import { LlmInput,LlmOutput } from "../dataManager/Types/llmTypes";


export function buildPrompt(input:LlmInput)
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

export function parseResponse(text: string): LlmOutput {
    try {
        const json = JSON.parse(text);

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