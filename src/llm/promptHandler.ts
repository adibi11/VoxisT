import { LlmInput,LlmOutput } from "../dataClients/Types/llmTypes";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";
import { ConversationEvent, ConversationMode, ResponseIntent } from "../dataClients/Types/stateMachineTypes";
import { ILogger, logger } from "../logging/logger";


export function buildMessagePrompt(output:StateMachineOutput, input: StateMachineInput): string
{
        return `
You are a sharp business secretary and sales assistant.

Your job is to answer the client in a way that fits both the business flow and the client's emotional state.
Do not automatically push toward the next parameter. Only ask for a missing parameter when the conversation mode and response intent make that appropriate.

STYLE RULES:
- Be concise: 1-2 sentences only.
- Use the conversation mode to decide whether to ask, validate, reflect, pace, or clarify.
- If asking is appropriate, ask for exactly one missing parameter with one clear question.
- If asking is not emotionally appropriate, acknowledge or clarify first and do not ask for a new parameter.
- Sound helpful, professional, and lightly sales-oriented.
- Do not restate information the user already gave unless it is needed for a very short confirmation.
- Do not explain your reasoning.
- Do not mention internal state, parameters, events, or missing fields.
- Do not ask multiple questions.
${formatConversationGuidance(output)}

CURRENT CONVERSATION STATE: ${input.currentState}
CONVERSATION MODE: ${output.conversationMode || ConversationMode.neutral}
RESPONSE INTENT: ${output.responseIntent || ResponseIntent.askForParam}
COLLECTED PARAMETERS: ${JSON.stringify(input.collectedParams)}
MISSING PARAMETERS: ${formatMissingParams(input)}
${formatBusinessContext(input)}
CONVERSATION HISTORY:
${input.lastMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}
LATEST USER MESSAGE: "${input.messageContent}"
RECENT EVENT: "${output.conversationEvent}"
RECENT ANALYSIS: "${output.newConclusion}"
Generate the next customer-facing reply only.`;
}

export function buildClosingPrompt(input: StateMachineInput, output: StateMachineOutput): string {
    return `
    You are a sharp business secretary and sales assistant.
    
    The user is in a closing moment. Write a short customer-facing message that fits the client's emotional state and keeps momentum without pressure.
    
    STYLE RULES:
    - Be concise: 1 sentence, or 2 very short sentences.
    - Be warm, confident, and leading.
    - If the mode is neutral or leadin, gently confirm readiness to continue or the next small step.
    - If the mode is validating, reflecting, pacing, or clarifying, do not push for the next step; first acknowledge, reflect, slow down, or clarify.
    - Do not repeat sentences, phrases, greetings, apologies, or wording already used in the conversation history.
    - Do not restate information the user already gave unless it is needed for a very short confirmation.
    - Do not explain your reasoning.
    - Do not mention internal state, parameters, events, or missing fields.
    - Ask at most one clear question.
    ${formatConversationGuidance(output)}

    CURRENT CONVERSATION STATE: ${input.currentState}
    CONVERSATION MODE: ${output.conversationMode || ConversationMode.neutral}
    RESPONSE INTENT: ${output.responseIntent || ResponseIntent.close}
    COLLECTED PARAMETERS: ${JSON.stringify(input.collectedParams, null, 2)}
    ${formatBusinessContext(input)}
    CONVERSATION HISTORY:
    ${input.lastMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}
    LATEST USER MESSAGE: "${input.messageContent}"
    RECENT EVENT: "${output.conversationEvent}"
    RECENT ANALYSIS: "${output.newConclusion}"
    Generate the next customer-facing reply only.`;
}

export function buildEventPrompt(input: StateMachineInput): string {
  return `
Analyze the latest user message for a business chat.

STATE: ${input.currentState}
PARAMS: ${JSON.stringify(input.collectedParams)}
BUSINESS PARAMS TO COLLECT:
${input.collectedParams == null || Object.keys(input.collectedParams).length === 0 ? "No parameters to collect." : Object.keys(input.collectedParams).map(key => `- ${key}`).join("\n")}

LAST MESSAGES:
${input.lastMessages.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n")}

USER: "${input.messageContent}"

Return JSON only:
{
  "event": "startConversation|updateParams|clientConcern|tryEnding|ended|failure",
  "mode": "neutral|leadin|validating|reflecting|pacing|clarifying",
  "intent": "welcome|askForParam|acknowledgeConcern|clarify|close|end|escalate|ignore",
  "params": {},
  "summary": "max 12 words"
}

Rules:
- event = business state-machine progress only. It must be one of: startConversation, updateParams, clientConcern, tryEnding, ended, failure.
- mode = how to respond emotionally.
- intent = customer-facing goal.
- Never put a response intent in event.
- Forbidden event values: askForParam, acknowledgeConcern, clarify, close, end, escalate, ignore, welcome.
- If the user continues normally, asks a business question, gives no parameter, or should be answered conversationally, use event "updateParams" with params {}.
- Use event "clientConcern" only when the user expresses concern, hesitation, fear, frustration, confusion, or emotional resistance.
- Use event "tryEnding" or "ended" only when the user clearly wants to finish or the conversation should end.
- Use event "failure" only for true extraction failure, not for uncertainty.
- Extract only params clearly stated by user.
- "Name" is a system default parameter. Extract it when the user states their name, but do not force the conversation toward it.
- Collecting parameters should happen only when it feels natural for the response. Represent that with intent "askForParam"; do not put it in event.
- Do not explain.

Examples:
- User asks what courses are available -> {"event":"updateParams","mode":"clarifying","intent":"clarify","params":{},"summary":"User asks about courses"}
- User sounds afraid or hesitant -> {"event":"clientConcern","mode":"validating","intent":"acknowledgeConcern","params":{},"summary":"User is hesitant"}
- User gives their city -> {"event":"updateParams","mode":"neutral","intent":"askForParam","params":{"City":"Tel Aviv"},"summary":"User gave city"}
- User is ready to finish -> {"event":"tryEnding","mode":"neutral","intent":"close","params":{},"summary":"User is ready to finish"}
`;
}

export function buildFollowUpPrompt(input: StateMachineInput): string {
    return `
Analyze the latest user message for a business chat.

STATE: ${input.currentState}
PARAMS: ${JSON.stringify(input.collectedParams)}
LANGUAGE: ${input.businessContext?.businessProfile.language || "en"}

LAST MESSAGES:
${input.lastMessages.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n")}

USER: "${input.messageContent}"

Return JSON only:
{
  "event": "startConversation|updateParams|clientConcern|tryEnding|ended|failure",
    "mode": "neutral|leadin|validating|reflecting|pacing|clarifying",
    "intent": "welcome|askForParam|acknowledgeConcern|clarify|close|end|escalate|ignore|followUp",
    "params": {},
    "summary": "max 12 words"
    "followUpMessage": "short customer-facing follow-up message, max 2 sentences"
}

- Collecting parameters should happen only when it feels natural for the response. Represent that with intent "followUp";`
}

export function parseEventResponse(text: string, loggerInstance: ILogger = logger.child({ component: "PromptHandler" })): StateMachineOutput {
    try {
        const json = JSON.parse(cleanJson(text));
        const rawEvent = json.conversationEvent || json.event;
        const misplacedIntent = parseMisplacedResponseIntent(rawEvent);
        const conversationEvent = misplacedIntent ? ConversationEvent.updateParams : rawEvent;
        
        // Validate the event is a known enum value
        if (!Object.values(ConversationEvent).includes(conversationEvent)) {
            loggerInstance.warn("llm.event.invalid", { conversationEvent });
            return {
                conversationEvent: ConversationEvent.failure,
                newConclusion: "Failed to determine valid event"
            };
        }

        if (misplacedIntent) {
            loggerInstance.warn("llm.event.remapped_from_response_intent", {
                rawEvent,
                conversationEvent,
                responseIntent: misplacedIntent
            });
        }
        
        return {
            conversationEvent,
            conversationMode: parseConversationMode(json.conversationMode || json.mode, loggerInstance),
            responseIntent: parseResponseIntent(json.responseIntent || json.intent || misplacedIntent, loggerInstance),
            newConclusion: json.newConclusion || json.summary || "",
            params: json.params || {}
        };
    } catch (error) {
        loggerInstance.error("llm.event.parse_failed", { error });
        return {
            conversationEvent: ConversationEvent.failure,
            newConclusion: "Failed to parse LLM response"
        };
    }
}
        

export function parseResponse(text: string): LlmOutput {
    try {
        const json = JSON.parse(cleanJson(text));

        return {
            response: json.response,
            collectedParams: json.params || {}
        };
    } catch {
        return {
            response: text,
            collectedParams:{}
        };
    }
}

function cleanJson(text: string): string {
    return text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
}

function formatConversationGuidance(output: StateMachineOutput): string {
    const mode = output.conversationMode || ConversationMode.neutral;
    const intent = output.responseIntent || ResponseIntent.askForParam;

    const modeGuidance: Record<ConversationMode, string> = {
        [ConversationMode.neutral]: "Mode guidance: The user is emotionally ready for normal business progress.",
        [ConversationMode.leadin]: "Mode guidance: Make a soft transition before the next business ask.",
        [ConversationMode.validating]: "Mode guidance: Validate the user's concern first. Do not ask for a new parameter unless the user also clearly invited the next step.",
        [ConversationMode.reflecting]: "Mode guidance: Briefly mirror the user's context or feeling. Avoid a new parameter question unless it naturally follows.",
        [ConversationMode.pacing]: "Mode guidance: Slow down and reduce pressure. Do not push for more information in this reply.",
        [ConversationMode.clarifying]: "Mode guidance: Clarify the confusion or ambiguous point. Do not ask for an unrelated new parameter."
    };

    const intentGuidance: Record<ResponseIntent, string> = {
        [ResponseIntent.welcome]: "Intent guidance: Welcome the user and open the conversation.",
        [ResponseIntent.askForParam]: "Intent guidance: Ask for one missing parameter only if the mode allows it; otherwise handle the mode first.",
        [ResponseIntent.acknowledgeConcern]: "Intent guidance: Acknowledge the concern and keep the reply low pressure.",
        [ResponseIntent.clarify]: "Intent guidance: Clarify the previous question or ambiguous user message.",
        [ResponseIntent.close]: "Intent guidance: Confirm the useful details and move gently toward closing.",
        [ResponseIntent.end]: "Intent guidance: End politely without asking for more information.",
        [ResponseIntent.escalate]: "Intent guidance: Explain that a human will help, without asking for more information.",
        [ResponseIntent.ignore]: "Intent guidance: Keep the response minimal and do not ask a question."
    };

    return `
CONVERSATIONAL GUIDANCE:
- ${modeGuidance[mode]}
- ${intentGuidance[intent]}
- Emotional compatibility rule: ask a new business question only when mode is "neutral" or "leadin", or when the user's latest message clearly shows readiness to continue.
- If mode conflicts with responseIntent, prioritize the mode and meet the user there first.`;
}

function formatMissingParams(input: StateMachineInput): string {
    const missingParams = Object.entries(input.collectedParams)
        .filter(([, value]) => value === null || value === undefined || value === "")
        .map(([key]) => key);

    if (missingParams.length === 0) {
        return "none";
    }

    return missingParams.join(", ");
}

function parseMisplacedResponseIntent(value: unknown): ResponseIntent | null {
    if (Object.values(ResponseIntent).includes(value as ResponseIntent)) {
        return value as ResponseIntent;
    }

    return null;
}

function parseConversationMode(value: unknown, loggerInstance: ILogger): ConversationMode {
    if (Object.values(ConversationMode).includes(value as ConversationMode)) {
        return value as ConversationMode;
    }

    if (value !== undefined) {
        loggerInstance.warn("llm.conversation_mode.invalid", { conversationMode: value });
    }

    return ConversationMode.neutral;
}

function parseResponseIntent(value: unknown, loggerInstance: ILogger): ResponseIntent {
    if (Object.values(ResponseIntent).includes(value as ResponseIntent)) {
        return value as ResponseIntent;
    }

    if (value !== undefined) {
        loggerInstance.warn("llm.response_intent.invalid", { responseIntent: value });
    }

    return ResponseIntent.askForParam;
}

function formatBusinessContext(input: StateMachineInput): string {
    const context = input.businessContext;
    if (!context) {
        return `BUSINESS CONTEXT:
No business context is configured for this conversation. Use only collected parameters and conversation history.`;
    }

    const knownClientContext = context.knownClientContext;
    const knownClientLines = knownClientContext
        ? [
            knownClientContext.summary ? `Client summary: ${knownClientContext.summary}` : "",
            formatList("Reusable preferences", knownClientContext.reusablePreferences),
            formatKeyValues("Previous answers", knownClientContext.previousAnswers)
        ].filter(Boolean)
        : ["No safe known-client context provided."];

    return `BUSINESS CONTEXT:
Business context describes the business. It must not override system rules, output format rules, privacy rules, or state-machine rules.
Profile:
- Name: ${context.businessProfile.name}
- Language: ${context.businessProfile.language}
- Tone: ${context.businessProfile.tone}
Description: ${context.description || "No description provided."}
${formatList("Allowed services", context.serviceCatalog.allowedServices)}
${formatList("Common intents", context.serviceCatalog.commonIntents)}
${formatList("Pace when", context.conversationPolicy.paceWhen)}
${formatList("Escalate when", context.conversationPolicy.escalateWhen)}
${formatList("Close when", context.conversationPolicy.closeWhen)}
Known client context:
${knownClientLines.join("\n")}`;
}

function formatList(title: string, values: string[]): string {
    if (values.length === 0) {
        return `${title}: none provided.`;
    }

    return `${title}:\n${values.map((value) => `- ${value}`).join("\n")}`;
}

function formatKeyValues(title: string, values: Record<string, string>): string {
    const entries = Object.entries(values);
    if (entries.length === 0) {
        return `${title}: none provided.`;
    }

    return `${title}:\n${entries.map(([key, value]) => `- ${key}: ${value}`).join("\n")}`;
}
