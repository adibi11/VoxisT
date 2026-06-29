import { LlmInput,LlmOutput } from "../dataClients/Types/llmTypes";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";

export interface ILlmProvider {
    generateResponse(input: StateMachineInput, output: StateMachineOutput): Promise<string>;
    extractEvents(input: StateMachineInput): Promise<StateMachineOutput>;
    getClosingMessage(output: StateMachineOutput, input: StateMachineInput): Promise<string>;
    
}
