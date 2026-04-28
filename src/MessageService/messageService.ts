import { Message } from "../dataClients/Types/apiTypes";

import { ActionType } from "../dataClients/Types/apiTypes";

import { ICacheManager } from "../dataClients/CacheClient/cacheInterface";

import { ISqlInterface } from "../dataClients/SqlClient/sqlInterface";
import { ConversationCacheState, LastMessages as LastMessage } from "../dataClients/Types/messageTypes";
import { ILlmProvider } from "../llm/llmInterface";
import { LlmPipeline } from "./messageApply";


export class MessageService {
    private cacheManager: ICacheManager;
    private sqlInterface: ISqlInterface;
    private llmPiplne: LlmPipeline;

    constructor(cacheManager: ICacheManager, sqlInterface: ISqlInterface,llm:ILlmProvider) {
        this.cacheManager = cacheManager;
        this.sqlInterface = sqlInterface;
        this.llmPiplne = new LlmPipeline(llm, sqlInterface);
    }

    async  processMessage(message: Message) {
        
        console.log("Processing message:", message);
        switch (message.type) {
            case ActionType.Create:
                // Handle create logic
                console.log("Creating message:", message.content);
                break;
            case ActionType.Update:
                // Handle update logic
                console.log("Updating message:", message.content);
                break;
            case ActionType.Delete:
                // Handle delete logic
                console.log("Deleting message:", message.content);
                break;
            case ActionType.HandleMessage:
                // Handle message logic
                console.log("Handling message:", message.content);
                await this.handleMessage(message);
                break;

        }

    }

    async handleMessage(message: Message) {
        
        let client = await this.sqlInterface.getOrCreateClientByPhone(message.data.From);
        // Implement locking mechanism to prevent concurrent processing of messages for the same client and business
        //Will work between mulriple consumers of the service, but not between multiple instances of the service. For that we will need to use a distributed lock like Redlock.
        const lockAcquired = await this.cacheManager.acquireLock(client.id, message.businessId || 1);
        if (!lockAcquired) {
            console.log("Could not acquire lock, another process is handling this conversation. Skipping message.");
            return;
        }
        try {
            let conversationState: ConversationCacheState | null = await this.cacheManager.getCacheState(client.id, message.businessId || 1);
            let messages:LastMessage[] = [];
            messages.push({
                role:"user",
                content: message.data.Body
            });
            if (!conversationState) {
                console.log("No conversation state in cache, fetching from DB.");
                conversationState = await this.sqlInterface.getCacheState(client.id, message.businessId || 1);
                if (!conversationState) {
                    // Handle the case where no conversation state is found
                    console.log("No existing conversation state found. exiting.");
                    await this.sqlInterface.createDbConversation(client.id, message.businessId || 1, message.data.Body);
                    conversationState = await this.sqlInterface.getCacheState(client.id, message.businessId || 1);
                    if (!conversationState) {
                        throw new Error("Failed to create and retrieve conversation state.");
                    }
                }
            }
           
            console.log("Initial conversation state:", conversationState);

            try{
                console.log("Applying LLM pipeline to message.");
                const botResponse:string = (await this.llmPiplne.applyPipline(conversationState,message.data.Body,message.businessId || 1)).response
                messages.push({
                    role:"bot",
                    content: botResponse
                });
            }
            catch{
                throw("LLM Failed interpreting");
                //Implement fall back in the future for unsuccessfull response.
            }try{
                await this.handleCreateMessages(message, conversationState!,messages);
                await this.cacheManager.setCacheState(client.id, message.businessId || 1, conversationState!);
            }
            catch{
                throw("Failed to create messages in DB");
            }   

        }
        catch (error) {
            console.error("Error handling message:", error);
        }
        finally {
            await this.cacheManager.releaseLock(client.id, message.businessId || 1);
        }
    }
    
    async handleCreateMessages(message: Message, conversationState: ConversationCacheState,lastMessages:LastMessage[]) {
        
        //Mock response from bot
        await this.syncCacheToDb(message.data.clientId, message.businessId || 1, conversationState,lastMessages);
        
    }

    async syncCacheToDb(clientId: number, businessId: number, conversationState: ConversationCacheState,messages:LastMessage[]) {
        // Sync cache state to DB
        await Promise.all(
            Object.entries(messages).map(([role, content]) =>
                this.sqlInterface.createMessage(
                    conversationState.conversationId,
                    role === "user" ? "user" : "bot",
                    content.content
                )
            )
        );
        for (const [paramName, paramValue] of Object.entries(conversationState.collectedParams)) {
            if (paramValue) {
                await this.sqlInterface.upsertParamAnswer(clientId, conversationState.conversationId, businessId, paramName, paramValue.toString());
            }
        }
    }
}