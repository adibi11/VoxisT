import { OpenAIApi } from "./openaiApi";
import { CommunicationChannel, MessageProvider } from "../dataClients/Types/apiTypes";
import { ConversationEvent, ConversationState } from "../dataClients/Types/stateMachineTypes";
import { logger } from "../logging/logger";

// 🔹 types (כמו אצלך)
type ChatMessage = {
  role: "user" | "bot";
  content: string;
};

type ConversationCacheState = {
  conversationId: number;
  state: ConversationState;
  channel: CommunicationChannel;
  provider?: MessageProvider;
  lastMessages: ChatMessage[];
  collectedParams: Record<string,any>;
  updatedAt: Date;
  phone: string;
};

// 🔹 input/output של LLM
type LLMInput = {
  messages: ChatMessage[];
  collectedParams: Record<string, any>;
};

type LLMOutput = {
  response: string;
  collectedParams?: Record<string,any>;
};

function createMockState(): ConversationCacheState {
  return {
    conversationId: 1,
    state: ConversationState.collecting,
    channel: CommunicationChannel.Whatsapp,
    provider: MessageProvider.Twilio,
    lastMessages: [
      { role: "user", content: "Hi" },
      { role: "bot", content: "What is your budget?" }
    ],
    collectedParams: {
      budget: null,
      city: null
    },
    updatedAt: new Date(),
    phone: "+10000000000"
  };
}

function buildLLMInput(
  state: ConversationCacheState,
  newMessage: string
): LLMInput {

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
  result: LLMOutput
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

// 🔹 main test flow
async function run() {

  const testLogger = logger.child({ component: "LlmTest" });
  const llm = new OpenAIApi(testLogger.child({ component: "OpenAIApi" }));

  let state = createMockState();

  const newUserMessage = "My budget is 5000";

  testLogger.info("llm_test.before", { state });

  // 🔹 build input
  const input = {
    currentState: state.state,
    messageContent: newUserMessage,
    collectedParams: state.collectedParams,
    lastMessages: state.lastMessages,
    businessContext: null
  };

  testLogger.info("llm_test.input", { input });

  // 🔹 call LLM
  const result: LLMOutput = {
    response: await llm.generateResponse(input, {
      conversationEvent: ConversationEvent.updateParams,
      newConclusion: "User provided budget",
      params: { budget: 5000 }
    }),
    collectedParams: {}
  };

  testLogger.info("llm_test.output", { result });

  // 🔹 apply result to state
  applyLLMResult(state, newUserMessage, result);

  testLogger.info("llm_test.after", { state });
}

run();
