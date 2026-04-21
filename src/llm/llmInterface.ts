import { LlmInput,LlmOutput } from "../dataClients/Types/llmTypes";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";

export interface ILlmProvider {
    generateResponse(input: LlmInput): Promise<LlmOutput>;
    extractEvents(input: StateMachineInput): Promise<StateMachineOutput>;
}