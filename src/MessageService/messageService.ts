import { Message } from "../dataClients/Types/apiTypes";

import { ActionType } from "../dataClients/Types/apiTypes";

import { ICacheManager } from "../dataClients/CacheClient/cacheInterface";

import { ISqlInterface } from "../dataClients/SqlClient/sqlInterface";
import { ConversationCacheState, LastMessages as LastMessage } from "../dataClients/Types/messageTypes";
import { ILlmProvider } from "../llm/llmInterface";
import { LlmPipeline } from "./messageApply";
import { ILogger, logger } from "../logging/logger";


export class MessageService {
    private cacheManager: ICacheManager;
    private sqlInterface: ISqlInterface;
    private llmPiplne: LlmPipeline;
    private logger: ILogger;

    constructor(cacheManager: ICacheManager, sqlInterface: ISqlInterface,llm:ILlmProvider, loggerInstance: ILogger = logger.child({ component: "MessageService" })) {
        this.cacheManager = cacheManager;
        this.sqlInterface = sqlInterface;
        this.logger = loggerInstance;
        this.llmPiplne = new LlmPipeline(llm, sqlInterface, this.logger.child({ component: "LlmPipeline" }));
    }

    async  processMessage(message: Message) {
        
        this.logger.info("message.processing.received", {
            actionType: message.type,
            businessId: message.businessId,
            from: message.data?.From,
            to: message.data?.To,
            bodyLength: message.data?.Body?.length
        });
        switch (message.type) {
            case ActionType.Create:
                // Handle create logic
                this.logger.info("message.create.received", { contentLength: message.content?.length });
                break;
            case ActionType.Update:
                // Handle update logic
                this.logger.info("message.update.received", { contentLength: message.content?.length });
                break;
            case ActionType.Delete:
                // Handle delete logic
                this.logger.info("message.delete.received", { contentLength: message.content?.length });
                break;
            case ActionType.HandleMessage:
                // Handle message logic
                this.logger.info("message.handle.started", { contentLength: message.content?.length });
                await this.handleMessage(message);
                break;

        }

    }

    async handleMessage(message: Message) {
        
        let client = await this.sqlInterface.getOrCreateClientByPhone(message.data.From);
        const businessId = message.businessId || 1;
        const flowLogger = this.logger.child({
            clientId: client.id,
            businessId,
            from: message.data.From,
            to: message.data.To
        });
        flowLogger.info("client.resolved");
        // Implement locking mechanism to prevent concurrent processing of messages for the same client and business
        //Will work between mulriple consumers of the service, but not between multiple instances of the service. For that we will need to use a distributed lock like Redlock.
        const lockAcquired = await this.cacheManager.acquireLock(client.id, businessId);
        if (!lockAcquired) {
            flowLogger.warn("conversation.lock.skipped");
            return;
        }
        flowLogger.info("conversation.lock.acquired");
        try {
            let conversationState: ConversationCacheState | null = await this.cacheManager.getCacheState(client.id, businessId);
            let messages:LastMessage[] = [];
            messages.push({
                role:"user",
                content: message.data.Body
            });
            if (!conversationState) {
                flowLogger.info("conversation.cache.miss");
                conversationState = await this.sqlInterface.getCacheState(client.id, businessId);
                if (!conversationState) {
                    // Handle the case where no conversation state is found
                    flowLogger.info("conversation.db.miss.creating");
                    await this.sqlInterface.createDbConversation(client.id, businessId, message.data.Body);
                    conversationState = await this.sqlInterface.getCacheState(client.id, businessId);
                    if (!conversationState) {
                        throw new Error("Failed to create and retrieve conversation state.");
                    }
                }
            } else {
                flowLogger.info("conversation.cache.hit", {
                    conversationId: conversationState.conversationId,
                    state: conversationState.state,
                    lastMessagesCount: conversationState.lastMessages.length
                });
            }
           
            flowLogger.info("conversation.initialized", {
                conversationId: conversationState.conversationId,
                state: conversationState.state,
                collectedParams: conversationState.collectedParams,
                lastMessagesCount: conversationState.lastMessages.length
            });

            try{
                flowLogger.info("llm.pipeline.started", { conversationId: conversationState.conversationId });
                const botResponse:string = (await this.llmPiplne.applyPipline(conversationState,message.data.Body,businessId)).response
                messages.push({
                    role:"bot",
                    content: botResponse
                });
                flowLogger.info("llm.pipeline.finished", {
                    conversationId: conversationState.conversationId,
                    botResponseLength: botResponse.length
                });
            }
            catch{
                throw new Error("LLM Failed interpreting");
                //Implement fall back in the future for unsuccessfull response.
            }try{
                await this.handleCreateMessages(client.id, message, conversationState!,messages);
                this.applyMessagesToCacheState(conversationState!, messages);
                await this.cacheManager.setCacheState(client.id, businessId, conversationState!);
                flowLogger.info("conversation.persisted", {
                    conversationId: conversationState.conversationId,
                    state: conversationState.state,
                    messagesWritten: messages.length,
                    lastMessagesCount: conversationState.lastMessages.length
                });
            }
            catch{
                throw new Error("Failed to create messages in DB");
            }   

        }
        catch (error) {
            flowLogger.error("message.handle.failed", { error });
            throw error;
        }
        finally {
            await this.cacheManager.releaseLock(client.id, businessId);
            flowLogger.info("conversation.lock.released");
        }
    }
    
    async handleCreateMessages(clientId: number, message: Message, conversationState: ConversationCacheState,lastMessages:LastMessage[]) {
        
        //Mock response from bot
        await this.syncCacheToDb(clientId, message.businessId || 1, conversationState,lastMessages);
        
    }

    async syncCacheToDb(clientId: number, businessId: number, conversationState: ConversationCacheState,messages:LastMessage[]) {
        // Sync cache state to DB
        await Promise.all(
            messages.map((message) =>
                this.sqlInterface.createMessage(
                    conversationState.conversationId,
                    message.role,
                    message.content
                )
            )
        );
        for (const [paramName, paramValue] of Object.entries(conversationState.collectedParams)) {
            if (paramValue) {
                await this.sqlInterface.upsertParamAnswer(clientId, conversationState.conversationId, businessId, paramName, paramValue.toString());
            }
        }
    }

    applyMessagesToCacheState(conversationState: ConversationCacheState, messages: LastMessage[]) {
        conversationState.lastMessages.push(...messages);
        conversationState.updatedAt = new Date();
    }
}
