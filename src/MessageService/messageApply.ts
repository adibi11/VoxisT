import { ConversationCacheState } from "../dataClients/Types/messageTypes";
import { LlmInput, LlmOutput } from "../dataClients/Types/llmTypes";
import { ILlmProvider } from "../llm/llmInterface";
import { StateMachineInput, StateMachineOutput } from "../dataClients/Types/stateMachineTypes";
import { ConversationStateMachine } from "./context/conversationSM";
import { Executer } from "./context/executer";
import { ISqlInterface } from "../dataClients/SqlClient/sqlInterface";
import { ILogger, logger } from "../logging/logger";

export class LlmPipeline{

    private llmProvider : ILlmProvider
    private sqlInterface: ISqlInterface;
    private logger: ILogger;

    constructor(llm:ILlmProvider,sqlInterface: ISqlInterface, loggerInstance: ILogger = logger.child({ component: "LlmPipeline" }))
    {
        this.llmProvider = llm;
        this.sqlInterface = sqlInterface;
        this.logger = loggerInstance;
    }

    async applyPipline(state:ConversationCacheState,message:string,businessId: number): Promise<LlmOutput>{
        this.logger.info("conversation.state.before", {
          conversationId: state.conversationId,
          state: state.state,
          collectedParams: state.collectedParams,
          lastMessagesCount: state.lastMessages.length,
          phone: state.phone
        });
        const executer = new Executer(this.llmProvider, this.logger.child({ component: "Executer" }));
        const stateMachineInput = buildStateMachineInput(state, message);
        const output = await executer.prepareAndExecute(stateMachineInput,state);
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
    newMessage: string
): StateMachineInput {
    return {
        currentState: state.state,
        messageContent: newMessage,
        collectedParams: state.collectedParams,
        lastMessages: state.lastMessages
    };
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

