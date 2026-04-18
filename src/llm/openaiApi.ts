import "dotenv/config";
import { OpenAI } from "openai";
import { LlmInput,LlmOutput } from "../dataManager/Types/llmTypes";
import { ILlmProvider } from "./llmInterface";
import { buildPrompt ,parseResponse} from "./promptHandler";



export class OpenAIApi implements ILlmProvider {

    private llmclient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    async generateResponse(input: LlmInput): Promise<LlmOutput> {

        const prompt = buildPrompt(input);

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
}