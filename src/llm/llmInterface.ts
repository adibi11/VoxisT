import { LlmInput,LlmOutput } from "../dataClients/Types/llmTypes";

export interface ILlmProvider {
    generateResponse(input: LlmInput): Promise<LlmOutput>;
}