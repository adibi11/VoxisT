import "dotenv/config";
import { OpenAI } from "openai";
import { LlmInput,LlmOutput } from "../dataClients/Types/llmTypes";
import { ILlmProvider } from "./llmInterface";
import { buildMessagePrompt ,buildClosingPrompt,parseResponse} from "./promptHandler";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";
import { buildEventPrompt, parseEventResponse } from "./promptHandler";
import { ILogger, logger } from "../logging/logger";



export class OpenAIApi implements ILlmProvider {
    private logger: ILogger;

    private llmclient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    constructor(loggerInstance: ILogger = logger.child({ component: "OpenAIApi" })) {
        this.logger = loggerInstance;
    }
    async generateResponse(input: StateMachineInput, output: StateMachineOutput): Promise<string> {

        const prompt = buildMessagePrompt(output, input);

        const completion = await this.llmclient.chat.completions.create({
            model: "gpt-5.5",
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

        return parseEventResponse(text, this.logger);
    }

    getClosingMessage(output: StateMachineOutput, input: StateMachineInput): Promise<string> {
        const prompt = buildClosingPrompt(input, output);
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
