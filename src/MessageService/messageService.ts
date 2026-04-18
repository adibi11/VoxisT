import { Message } from "../dataManager/Types/apiTypes";

import { ActionType } from "../dataManager/Types/apiTypes";

import { ICacheManager } from "../dataManager/CacheManager/cacheInterface";

import { ISqlInterface } from "../dataManager/DalService/sqlInterface";


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
            case ActionType.Update:
                // Handle update logic
                console.log("Updating message:", message.content);
            case ActionType.Delete:
                // Handle delete logic
                console.log("Deleting message:", message.content);
            case ActionType.HandleMessage:
                // Handle message logic

                console.log("Handling message:", message.content);
                await this.handleMessage(message);

        }

    }

    async handleMessage(message: Message) {
        
        let client = await this.sqlInterface.getOrCreateClientByPhone(message.data.From);

        let conversationState = await this.cacheManager.getCacheState(client.id, message.businessId || 1);

        if (!conversationState) {
            conversationState = await this.sqlInterface.getCacheState(client.id, message.businessId || 1);
        }
        console.log("Current conversation state:", conversationState);

        
    }
}