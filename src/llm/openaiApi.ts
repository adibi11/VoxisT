import "dotenv/config";
import { OpenAI } from "openai";
import { LlmInput,LlmOutput } from "../dataClients/Types/llmTypes";
import { ILlmProvider } from "./llmInterface";
import { buildMessagePrompt ,buildPacingPrompt,parseResponse} from "./promptHandler";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";
import { buildEventPrompt, parseEventResponse } from "./promptHandler";



export class OpenAIApi implements ILlmProvider {

    private llmclient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    
    async getPacingMessage(output: StateMachineOutput, input: StateMachineInput): Promise<string> {
        const prompt = buildPacingPrompt(input, output);
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
        return text.trim();
    }
    async generateResponse(input: StateMachineInput, output: StateMachineOutput): Promise<string> {

        const prompt = buildMessagePrompt(output, input);

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

        return text.trim();
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

    getClosingMessage(output: StateMachineOutput, input: StateMachineInput): Promise<string> {
        const prompt = buildPacingPrompt(input, output);
        return this.llmclient.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
        }).then(response => {
            const text = response.choices[0]?.message?.content || "";
            return text.trim();
        });
    }
}