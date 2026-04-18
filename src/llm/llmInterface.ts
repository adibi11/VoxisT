import { LlmInput,LlmOutput } from "../dataManager/Types/llmTypes";

export interface ILlmProvider {
    generateResponse(input: LlmInput): Promise<LlmOutput>;
}