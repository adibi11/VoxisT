import { Message } from "../dataManager/Types/apiTypes";

import { ActionType } from "../dataManager/Types/apiTypes";

import { ICacheManager } from "../dataManager/CacheManager/cacheInterface";

import { ISqlInterface } from "../dataManager/DalService/sqlInterface";
import { ConversationCacheState } from "../dataManager/Types/messageTypes";


export class MessageService {
    private cacheManager: ICacheManager;
    private sqlInterface: ISqlInterface;

    constructor(cacheManager: ICacheManager, sqlInterface: ISqlInterface) {
        this.cacheManager = cacheManager;
        this.sqlInterface = sqlInterface;
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

            if (!conversationState) {
                conversationState = await this.sqlInterface.getCacheState(client.id, message.businessId || 1);
                if (!conversationState) {
                    // Handle the case where no conversation state is found
                    console.log("No existing conversation state found.");
                    return;
                }
            }
            console.log("Current conversation state:", conversationState);
            await this.handleCreateMessages(message, conversationState!);
            await this.cacheManager.setCacheState(client.id, message.businessId || 1, conversationState!);

        }
        catch (error) {
            console.error("Error handling message:", error);
        }
        finally {
            await this.cacheManager.releaseLock(client.id, message.businessId || 1);
        }
    }
    
    async handleCreateMessages(message: Message, conversationState: ConversationCacheState) {
        
        // Update cache state
        //Mock response from bot

        const botResponse = "This is a response from the bot.";
        const responses : Record<string, string> = {
            "user": message.content,
            "bot": botResponse
        }
        await this.syncCacheToDb(message.data.clientId, message.businessId || 1, conversationState,responses);
        conversationState.lastMessages.push({ role: "user", content: message.content });
        conversationState.lastMessages.push({ role: "bot", content: botResponse });
        conversationState.updatedAt = new Date();
    }

    async syncCacheToDb(clientId: number, businessId: number, conversationState: ConversationCacheState,messages:Record<string, string>) {
        // Sync cache state to DB
        await Promise.all(
            Object.entries(messages).map(([role, content]) =>
                this.sqlInterface.createMessage(
                    conversationState.conversationId,
                    role === "user" ? "user" : "bot",
                    content
                )
            )
        );
        for (const [paramName, paramValue] of Object.entries(conversationState.collectedParams)) {
            if (paramValue) {
                await this.sqlInterface.upsertParamAnswer(clientId, conversationState.conversationId, businessId, paramName, paramValue);
            }
        }
    }
}