import { StateMachineInput, StateMachineOutput } from "../../src/dataClients/Types/stateMachineTypes";
import { ILlmProvider } from "../../src/llm/llmInterface";

export class FakeLlmProvider implements ILlmProvider {
  public extractEventInputs: StateMachineInput[] = [];
  public responseInputs: { input: StateMachineInput; output: StateMachineOutput }[] = [];
  public pacingInputs: { input: StateMachineInput; output: StateMachineOutput }[] = [];
  public closingInputs: { input: StateMachineInput; output: StateMachineOutput }[] = [];

  private eventQueue: StateMachineOutput[];
  private responseQueue: string[];
  private pacingQueue: string[];
  private closingQueue: string[];

  constructor(options?: {
    events?: StateMachineOutput[];
    responses?: string[];
    pacingMessages?: string[];
    closingMessages?: string[];
  }) {
    this.eventQueue = [...(options?.events || [])];
    this.responseQueue = [...(options?.responses || [])];
    this.pacingQueue = [...(options?.pacingMessages || [])];
    this.closingQueue = [...(options?.closingMessages || [])];
  }

  enqueueEvent(output: StateMachineOutput): void {
    this.eventQueue.push(output);
  }

  enqueueResponse(response: string): void {
    this.responseQueue.push(response);
  }

  enqueuePacingMessage(response: string): void {
    this.pacingQueue.push(response);
  }

  enqueueClosingMessage(response: string): void {
    this.closingQueue.push(response);
  }

  async extractEvents(input: StateMachineInput): Promise<StateMachineOutput> {
    this.extractEventInputs.push(input);
    const output = this.eventQueue.shift();
    if (!output) {
      throw new Error("FakeLlmProvider.extractEvents called without a queued event");
    }
    return output;
  }

  async generateResponse(input: StateMachineInput, output: StateMachineOutput): Promise<string> {
    this.responseInputs.push({ input, output });
    return this.responseQueue.shift() || "fake response";
  }

  async getPacingMessage(output: StateMachineOutput, input: StateMachineInput): Promise<string> {
    this.pacingInputs.push({ input, output });
    return this.pacingQueue.shift() || "fake pacing message";
  }

  async getClosingMessage(output: StateMachineOutput, input: StateMachineInput): Promise<string> {
    this.closingInputs.push({ input, output });
    return this.closingQueue.shift() || "fake closing message";
  }
}
