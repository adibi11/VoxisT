import { ConversationCacheState } from "../dataClients/Types/messageTypes";
import { LlmInput, LlmOutput } from "../dataClients/Types/llmTypes";
import { ILlmProvider } from "../llm/llmInterface";

export class LlmPipeline{

    private llmProvider : ILlmProvider

    constructor(llm:ILlmProvider)
    {
        this.llmProvider = llm;
    }

    async applyPipline(state:ConversationCacheState,message:string){
        console.log("---- BEFORE ----");
        console.log(JSON.stringify(state, null, 2));

        // 🔹 build input
        const input = buildLLMInput(state, message);

        console.log("\n---- LLM INPUT ----");
        console.log(input);

        // 🔹 call LLM
        const result: LlmOutput = await this.llmProvider.generateResponse(input);

        console.log("\n---- LLM OUTPUT ----");
        console.log(result);

        // 🔹 apply result to state
        applyLLMResult(state, message, result);

        console.log("\n---- AFTER ----");
        console.log(JSON.stringify(state, null, 2));
        
    }
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

