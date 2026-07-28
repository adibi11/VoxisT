import { BusinessContext, ConversationCacheState } from "../dataClients/Types/messageTypes";
import { LlmInput, LlmOutput } from "../dataClients/Types/llmTypes";
import { ILlmProvider } from "../llm/llmInterface";
import { BusinessContextForPrompt, StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";
import { ConversationStateMachine } from "./context/conversationSM";
import { Executer } from "./context/executer";
import { IDatabaseClient } from "../dataClients/SqlClient/sqlInterface";
import { BusinessParamDefinition } from "../dataClients/Types/paramTypes";
import { ensureClientNameParamDefinition } from "../dataClients/Types/clientNameParam";
import { ILogger, logger } from "../logging/logger";
import { ToolRegistry } from "../Tools/ToolRegistry";
import { UpsertScheduledTaskTool } from "../Tools/upsertScheduledTaskTool";

export class LlmPipeline{

    private llmProvider : ILlmProvider
    private sqlInterface: IDatabaseClient;
    private logger: ILogger;
    private toolRegistry: ToolRegistry;

    constructor(llm:ILlmProvider,sqlInterface: IDatabaseClient, loggerInstance: ILogger = logger.child({ component: "LlmPipeline" }))
    {
        this.llmProvider = llm;
        this.sqlInterface = sqlInterface;
        this.logger = loggerInstance;
        this.toolRegistry = new ToolRegistry(this.logger.child({ component: "ToolRegistry" }));
        this.toolRegistry.register(new UpsertScheduledTaskTool(sqlInterface));
    }

    // AI-initiated scheduling is opt-in per business via the BOOK_APPOINTMENT action.
    private async isSchedulingEnabled(businessId: number): Promise<boolean> {
        try {
            const action = await this.sqlInterface.getBusinessAction(businessId);
            return action.action === "BOOK_APPOINTMENT";
        } catch {
            return false;
        }
    }


    async applyFollowUpPipline(conversationState: ConversationCacheState, businessId: number): Promise<LlmOutput>{
        
        
        this.logger.info("business.context.load.started", { businessId });
        const businessContext = sanitizeBusinessContext(await this.sqlInterface.getBusinessContext(businessId));
        this.logger.info("business.context.load.finished", {
          businessId,
          hasBusinessContext: Boolean(businessContext)
        });
        const paramDefinitions = ensureClientNameParamDefinition(await this.sqlInterface.getActiveBusinessParameterDefinitions(businessId));
        const stateMachineInput: StateMachineInput = buildStateMachineInput(conversationState, conversationState.lastMessages[conversationState.lastMessages.length - 1].content, businessContext, paramDefinitions);
        this.logger.info("llm.executer.started", {
          conversationId: conversationState.conversationId,
          state: conversationState.state,
          messageLength: conversationState.lastMessages[conversationState.lastMessages.length - 1].content.length
        });
        const executer = new Executer(this.llmProvider, this.logger.child({ component: "Executer" }));
        return executer.ExecuteFollowUp(stateMachineInput);
    }

    async applyMessagePipline(state:ConversationCacheState,message:string,businessId: number,clientId?: number): Promise<LlmOutput>{
        this.logger.info("conversation.state.before", {
          conversationId: state.conversationId,
          state: state.state,
          channel: state.channel,
          provider: state.provider,
          collectedParams: state.collectedParams,
          lastMessagesCount: state.lastMessages.length,
          phone: state.phone
        });
        const executer = new Executer(this.llmProvider, this.logger.child({ component: "Executer" }), this.toolRegistry);
        this.logger.info("business.context.load.started", { businessId });
        const businessContext = sanitizeBusinessContext(await this.sqlInterface.getBusinessContext(businessId));
        this.logger.info("business.context.load.finished", {
          businessId,
          hasBusinessContext: Boolean(businessContext)
        });
        const paramDefinitions = ensureClientNameParamDefinition(await this.sqlInterface.getActiveBusinessParameterDefinitions(businessId));
        //TODO -
        //Decide data flow regarding allowed LLM actions for each business
        const schedulingEnabled = /*await this.isSchedulingEnabled(businessId);*/true;
        const stateMachineInput = buildStateMachineInput(state, message, businessContext, paramDefinitions);
        stateMachineInput.schedulingEnabled = /*schedulingEnabled*/true;
        stateMachineInput.scheduledFor = state.scheduledFor;
        this.logger.info("llm.executer.started", {
          conversationId: state.conversationId,
          state: state.state,
          schedulingEnabled,
          messageLength: message.length
        });
        const output = await executer.prepareAndExecute(
          stateMachineInput,
          state,
          clientId !== undefined ? { businessId, clientId } : undefined
        );
        this.logger.info("llm.executer.finished", {
          conversationId: state.conversationId,
          state: state.state,
          responseLength: output.response.length
        });
        this.logger.info("conversation.state.after", {
          conversation: state
        });
        if(output.response === "starter" || output.response === "ender" || output.response === "escalate")
        {
          const business = await this.sqlInterface.getBusiness(businessId);
          switch(output.response)
          {
            case "starter":
              output.response = business?.starterMessage || "Welcome to our service! How can I assist you today?";
              break;
            case "ender":
              output.response = business?.endMessage || "Thank you for contacting us. If you have any more questions, feel free to reach out. Have a great day!";
              break;
            case "escalate":
              output.response = business?.escalationMessage || "I'm escalating your request to a human agent. Please wait while we connect you.";
              break;
          }
        }

        return output;
    }
}

function buildStateMachineInput(
    state: ConversationCacheState,
    newMessage: string,
    businessContext: BusinessContextForPrompt | null,
    paramDefinitions?: BusinessParamDefinition[]
): StateMachineInput {
    return {
        currentState: state.state,
        messageContent: newMessage,
        collectedParams: state.collectedParams,
        paramDefinitions,
        lastMessages: state.lastMessages,
        businessContext
    };
}

function sanitizeBusinessContext(context: BusinessContext | null): BusinessContextForPrompt | null {
    if (!context) {
        return null;
    }

    return {
        businessProfile: {
            name: sanitizeText(context.businessProfile.name, 120) || "Unknown business",
            language: sanitizeText(context.businessProfile.language, 40) || "en",
            tone: sanitizeText(context.businessProfile.tone, 200) || "professional and concise"
        },
        description: sanitizeNullableText(context.description, 1200),
        serviceCatalog: {
            allowedServices: sanitizeStringList(readListField(context.serviceCatalog, "allowedServices"), 30, 160),
            commonIntents: sanitizeStringList(readListField(context.serviceCatalog, "commonIntents"), 20, 160)
        },
        conversationPolicy: {
            paceWhen: sanitizeStringList(readListField(context.conversationPolicy, "paceWhen"), 10, 180),
            escalateWhen: sanitizeStringList(readListField(context.conversationPolicy, "escalateWhen"), 10, 180),
            closeWhen: sanitizeStringList(readListField(context.conversationPolicy, "closeWhen"), 10, 180)
        },
        knownClientContext: sanitizeKnownClientContext(context.knownClientContext)
    };
}

function sanitizeKnownClientContext(value: unknown): BusinessContextForPrompt["knownClientContext"] {
    if (!isRecord(value)) {
        return null;
    }

    const summary = sanitizeNullableText(value.summary, 600) || undefined;
    const reusablePreferences = sanitizeStringList(readListField(value, "reusablePreferences"), 10, 160);
    const previousAnswers = sanitizeStringRecord(value.previousAnswers, 20, 80, 200);

    if (!summary && reusablePreferences.length === 0 && Object.keys(previousAnswers).length === 0) {
        return null;
    }

    return {
        summary,
        reusablePreferences,
        previousAnswers
    };
}

function readListField(value: unknown, fieldName: string): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }

    if (isRecord(value) && Array.isArray(value[fieldName])) {
        return value[fieldName];
    }

    return [];
}

function sanitizeStringList(values: unknown[], maxItems: number, maxChars: number): string[] {
    return values
        .map((value) => sanitizeText(value, maxChars))
        .filter((value): value is string => Boolean(value))
        .slice(0, maxItems);
}

function sanitizeStringRecord(value: unknown, maxEntries: number, maxKeyChars: number, maxValueChars: number): Record<string, string> {
    if (!isRecord(value)) {
        return {};
    }

    const entries = Object.entries(value)
        .map(([key, entryValue]) => [
            sanitizeText(key, maxKeyChars),
            sanitizeText(entryValue, maxValueChars)
        ] as const)
        .filter(([key, entryValue]) => Boolean(key && entryValue))
        .slice(0, maxEntries);

    return Object.fromEntries(entries);
}

function sanitizeNullableText(value: unknown, maxChars: number): string | null {
    return sanitizeText(value, maxChars) || null;
}

function sanitizeText(value: unknown, maxChars: number): string {
    if (typeof value !== "string" && typeof value !== "number") {
        return "";
    }

    return String(value)
        .replace(/```/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxChars);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildLLMInput(
  state: ConversationCacheState,
  newMessage: string
): LlmInput {

  return {
    messages: [
      ...state.lastMessages.slice(-5), // limit context
      { role: "user", content: newMessage }
    ],
    collectedParams: state.collectedParams
  };
}


function applyLLMResult(
  state: ConversationCacheState,
  userMessage: string,
  result: LlmOutput
) {
  state.lastMessages.push({
    role: "user",
    content: userMessage
  });

  state.lastMessages.push({
    role: "bot",
    content: result.response
  });

  if (result.collectedParams) {
    for (const [key, value] of Object.entries(result.collectedParams)) {
      state.collectedParams[key] = value;
    }
  }

  state.updatedAt = new Date();
}


