import { OpenAIApi } from "./openaiApi";

// 🔹 types (כמו אצלך)
type ChatMessage = {
  role: "user" | "bot";
  content: string;
};

type ConversationCacheState = {
  conversationId: number;
  lastMessages: ChatMessage[];
  collectedParams: Record<string, string | null>;
  updatedAt: Date;
};

// 🔹 input/output של LLM
type LLMInput = {
  messages: ChatMessage[];
  collectedParams: Record<string, string | null>;
};

type LLMOutput = {
  response: string;
  extractedParams?: Record<string, string>;
};

function createMockState(): ConversationCacheState {
  return {
    conversationId: 1,
    lastMessages: [
      { role: "user", content: "Hi" },
      { role: "bot", content: "What is your budget?" }
    ],
    collectedParams: {
      budget: null,
      city: null
    },
    updatedAt: new Date()
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

  if (result.extractedParams) {
    for (const [key, value] of Object.entries(result.extractedParams)) {
      state.collectedParams[key] = value;
    }
  }

  state.updatedAt = new Date();
}

// 🔹 main test flow
async function run() {

  const llm = new OpenAIApi();

  let state = createMockState();

  const newUserMessage = "My budget is 5000";

  console.log("---- BEFORE ----");
  console.log(JSON.stringify(state, null, 2));

  // 🔹 build input
  const input = buildLLMInput(state, newUserMessage);

  console.log("\n---- LLM INPUT ----");
  console.log(input);

  // 🔹 call LLM
  const result: LLMOutput = await llm.generateResponse(input);

  console.log("\n---- LLM OUTPUT ----");
  console.log(result);

  // 🔹 apply result to state
  applyLLMResult(state, newUserMessage, result);

  console.log("\n---- AFTER ----");
  console.log(JSON.stringify(state, null, 2));
}

run();