import "dotenv/config";
import { OpenAI } from "openai";
import { ILlmProvider } from "./llmInterface";
import { buildMessagePrompt ,buildClosingPrompt} from "./promptHandler";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";
import { buildEventPrompt, buildFollowUpPrompt, parseEventResponse } from "./promptHandler";
import { ILogger, logger } from "../logging/logger";



export class OpenAIApi implements ILlmProvider {
    private logger: ILogger;
    private llmclient: OpenAI;

    constructor(loggerInstance: ILogger = logger.child({ component: "OpenAIApi" })) {
        this.logger = loggerInstance;
        const apiKey = process.env.OPENAI_API_KEY?.trim();
        const legacyApiKey = process.env.OPENAI_API?.trim();

        this.logger.info("openai.api_key.checked", {
            openaiApiKeyConfigured: Boolean(apiKey),
            legacyOpenaiApiConfigured: Boolean(legacyApiKey)
        });

        if (!apiKey) {
            this.logger.error("openai.api_key.missing", {
                expectedEnvVar: "OPENAI_API_KEY",
                legacyEnvVarPresent: Boolean(legacyApiKey)
            });
            throw new Error("OPENAI_API_KEY is required");
        }

        this.llmclient = new OpenAI({
            apiKey
        });
    }

    async getFollowUpMessage(input: StateMachineInput): Promise<string> {
        const prompt = buildFollowUpPrompt(input);
        const model = "gpt-4o";

        this.logger.info("openai.followup_message.requested", {
            model,
            currentState: input.currentState,
            lastMessagesCount: input.lastMessages.length,
            promptLength: prompt.length
        });

        try {
            const completion = await this.llmclient.chat.completions.create({
                model,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
            });

            const text = completion.choices[0]?.message?.content || "";
            this.logger.info("openai.followup_message.succeeded", {
                model,
                responseLength: text.length,
                choiceCount: completion.choices.length
            });

            return text.trim();
        } catch (error) {
            this.logger.error("openai.followup_message.failed", {
                model,
                error: getSafeOpenAiError(error)
            });
            throw error;
        }
    }
    async generateResponse(input: StateMachineInput, output: StateMachineOutput): Promise<string> {

        const prompt = buildMessagePrompt(output, input);
        const model = "gpt-5.5";

        this.logger.info("openai.generate_response.requested", {
            model,
            currentState: input.currentState,
            conversationEvent: output.conversationEvent,
            conversationMode: output.conversationMode,
            responseIntent: output.responseIntent,
            promptLength: prompt.length
        });

        try {
            const completion = await this.llmclient.chat.completions.create({
                model,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
            });

            const text = completion.choices[0]?.message?.content || "";
            this.logger.info("openai.generate_response.succeeded", {
                model,
                responseLength: text.length,
                choiceCount: completion.choices.length
            });

            return text.trim();
        } catch (error) {
            this.logger.error("openai.generate_response.failed", {
                model,
                error: getSafeOpenAiError(error)
            });
            throw error;
        }
    }
    async extractEvents(input: StateMachineInput): Promise<StateMachineOutput> {
        const prompt = buildEventPrompt(input);
        const model = "gpt-4o";

        this.logger.info("openai.extract_events.requested", {
            model,
            currentState: input.currentState,
            collectedParamNames: Object.keys(input.collectedParams),
            lastMessagesCount: input.lastMessages.length,
            promptLength: prompt.length
        });

        try {
            const completion = await this.llmclient.chat.completions.create({
                model,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
            });

            const text = completion.choices[0]?.message?.content || "";
            this.logger.info("openai.extract_events.succeeded", {
                model,
                responseLength: text.length,
                choiceCount: completion.choices.length
            });

            return parseEventResponse(text, this.logger);
        } catch (error) {
            this.logger.error("openai.extract_events.failed", {
                model,
                error: getSafeOpenAiError(error)
            });
            throw error;
        }
    }

    async getClosingMessage(output: StateMachineOutput, input: StateMachineInput): Promise<string> {
        const prompt = buildClosingPrompt(input, output);
        const model = "gpt-4o";

        this.logger.info("openai.closing_message.requested", {
            model,
            currentState: input.currentState,
            conversationEvent: output.conversationEvent,
            conversationMode: output.conversationMode,
            responseIntent: output.responseIntent,
            promptLength: prompt.length
        });

        try {
            const response = await this.llmclient.chat.completions.create({
                model,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
            });

            const text = response.choices[0]?.message?.content || "";
            this.logger.info("openai.closing_message.succeeded", {
                model,
                responseLength: text.length,
                choiceCount: response.choices.length
            });

            return text.trim();
        } catch (error) {
            this.logger.error("openai.closing_message.failed", {
                model,
                error: getSafeOpenAiError(error)
            });
            throw error;
        }
    }
}

function getSafeOpenAiError(error: unknown): Record<string, unknown> {
    if (!error || typeof error !== "object") {
        return {
            message: String(error)
        };
    }

    const record = error as Record<string, unknown>;
    return {
        name: record.name,
        message: record.message,
        status: record.status,
        code: record.code,
        type: record.type,
        requestId: record.request_id || record.requestId
    };
}
