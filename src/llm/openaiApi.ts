import "dotenv/config";
import { OpenAI } from "openai";
import { LlmInput,LlmOutput } from "../dataClients/Types/llmTypes";
import { ILlmProvider } from "./llmInterface";
import { buildMessagePrompt ,parseResponse} from "./promptHandler";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";
import { buildEventPrompt, parseEventResponse } from "./promptHandler";



export class OpenAIApi implements ILlmProvider {

    private llmclient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    async generateResponse(input: LlmInput): Promise<LlmOutput> {

        const prompt = buildMessagePrompt(input);

        const completion = await this.llmclient.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
        });

        const text = completion.choices[0]?.message?.content || "";

        return parseResponse(text);
    }
    async extractEvents(input: StateMachineInput): Promise<StateMachineOutput> {
        const prompt = buildEventPrompt(input);

        const completion = await this.llmclient.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
        });

        const text = completion.choices[0]?.message?.content || "";

        return parseEventResponse(text);
    }
}