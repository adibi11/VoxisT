import { Message } from "../dataClients/Types/apiTypes";

import { ApiActionType } from "../dataClients/Types/apiTypes";

import { ICacheManager } from "../dataClients/CacheClient/cacheInterface";

import { IDatabaseClient } from "../dataClients/SqlClient/sqlInterface";
import { ConversationCacheState, LastMessages as LastMessage } from "../dataClients/Types/messageTypes";
import {
    ensureClientNameParam,
    fillMissingClientNameParam,
    getClientNameParamValue
} from "../dataClients/Types/clientNameParam";
import { ILlmProvider } from "../llm/llmInterface";
import { LlmPipeline } from "./messageApply";
import { ILogger, logger } from "../logging/logger";
import { IOutboundMessageQueue } from "../QueueClient/queue";

const CONVERSATION_TIMEOUT_MS = 3 * 24 * 60 * 60 * 1000;
const CLOSED_CONVERSATION_STATES = new Set([
    "ended",
    "failure",
    "schedulingConfirmed",
    "schedulingFailed"
]);

export class MessageService {
    private cacheManager: ICacheManager;
    private sqlInterface: IDatabaseClient;
    private llmPiplne: LlmPipeline;
    private logger: ILogger;
    private outboundQueue?: IOutboundMessageQueue;

    constructor(
        cacheManager: ICacheManager,
        sqlInterface: IDatabaseClient,
        llm: ILlmProvider,
        loggerInstance: ILogger = logger.child({ component: "MessageService" }),
        outboundQueue?: IOutboundMessageQueue
    ) {
        this.cacheManager = cacheManager;
        this.sqlInterface = sqlInterface;
        this.logger = loggerInstance;
        this.outboundQueue = outboundQueue;
        this.llmPiplne = new LlmPipeline(llm, sqlInterface, this.logger.child({ component: "LlmPipeline" }));
    }

    async  processMessage(message: Message) {
        
        this.logger.info("message.processing.received", {
            actionType: message.type,
            channel: message.channel,
            provider: message.provider,
            businessId: message.businessId,
            from: message.data?.From,
            to: message.data?.To,
            bodyLength: message.data?.Body?.length
        });
        switch (message.type) {
            case ApiActionType.Create:
                // Handle create logic
                this.logger.info("message.create.received", { contentLength: message.content?.length });
                break;
            case ApiActionType.Update:
                // Handle update logic
                this.logger.info("message.update.received", { contentLength: message.content?.length });
                break;
            case ApiActionType.Delete:
                // Handle delete logic
                this.logger.info("message.delete.received", { contentLength: message.content?.length });
                break;
            case ApiActionType.HandleMessage:
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
            channel: message.channel,
            provider: message.provider,
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
            let messages:LastMessage[] = [];
            messages.push({
                role:"user",
                content: message.data.Body
            });
            const conversationState = await this.getConversationState(client.id, businessId, message.data.Body);
            ensureClientNameParam(conversationState.collectedParams);
           
            flowLogger.info("conversation.initialized", {
                conversationId: conversationState.conversationId,
                state: conversationState.state,
                channel: conversationState.channel,
                provider: conversationState.provider,
                collectedParams: conversationState.collectedParams,
                lastMessagesCount: conversationState.lastMessages.length
            });

            try{
                flowLogger.info("llm.pipeline.started", { conversationId: conversationState.conversationId });
                const botResponse:string = (await this.llmPiplne.applyPipline(conversationState,message.data.Body,businessId)).response
                //Push the response to the messages array to be persisted in the DB and cache state.
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
                // Persist the messages to the DB and update the cache state
                await this.handleCreateMessages(client.id, message, conversationState!,messages);
                // Update the cache state with the new messages
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
            try{
                // Enqueue the outbound message for delivery
                await this.enqueueOutboundMessage(client.id, businessId, message, conversationState!, messages);
            }
            catch{
                throw new Error("Failed to enqueue outbound message");
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
        if (conversationState.state === "ended") {
            fillMissingClientNameParam(conversationState.collectedParams);
        }

        const clientName = getClientNameParamValue(conversationState.collectedParams);
        if (clientName) {
            await this.sqlInterface.updateClientName(clientId, clientName);
        }

        for (const message of messages) {
            await this.sqlInterface.createMessage(
                conversationState.conversationId,
                message.role,
                message.content
            );
        }
        await this.sqlInterface.updateConversationState(conversationState.conversationId, conversationState.state);
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

    async enqueueOutboundMessage(
        clientId: number,
        businessId: number,
        inboundMessage: Message,
        conversationState: ConversationCacheState,
        messages: LastMessage[]
    ) {
        if (!this.outboundQueue) {
            this.logger.warn("outbound.enqueue.skipped", {
                reason: "outbound_queue_not_configured",
                conversationId: conversationState.conversationId,
                businessId,
                clientId
            });
            return;
        }

        const botMessage = [...messages].reverse().find((message) => message.role === "bot");
        if (!botMessage) {
            this.logger.warn("outbound.enqueue.skipped", {
                reason: "bot_message_missing",
                conversationId: conversationState.conversationId,
                businessId,
                clientId
            });
            return;
        }

        await this.outboundQueue.addOutboundMessage({
            message: {
                channel: inboundMessage.channel,
                provider: inboundMessage.provider || conversationState.provider!,
                from: inboundMessage.data.To,
                to: inboundMessage.data.From,
                body: botMessage.content,
                businessId,
                clientId,
                conversationId: conversationState.conversationId
            }
        });

        this.logger.info("outbound.enqueue.succeeded", {
            channel: inboundMessage.channel,
            provider: inboundMessage.provider || conversationState.provider,
            conversationId: conversationState.conversationId,
            businessId,
            clientId
        });
    }

    //getConversationState retrieves the current conversation state for a given client and business. 
    // If no active conversation exists or if the existing conversation has expired or is closed, 
    // it creates a new conversation and caches it.
    private async getConversationState(clientId: number, businessId: number, initialContent: string): Promise<ConversationCacheState> {
        const now = new Date();
        const activeConversationId = await this.cacheManager.getActiveConversationId(clientId, businessId);
        // If an active conversation ID exists, attempt to retrieve its cached state
        if (activeConversationId) {
            // If a cached state exists for the active conversation, check if it should continue
            const cachedState = await this.cacheManager.getCacheStateByConversationId(activeConversationId);
            if (cachedState) {
                if (this.shouldContinueConversation(cachedState, now)) {
                    this.logger.info("conversation.cache.hit", {
                        clientId,
                        businessId,
                        conversationId: cachedState.conversationId,
                        state: cachedState.state,
                        lastMessagesCount: cachedState.lastMessages.length
                    });
                    return cachedState;
                }
                // If the cached state is expired or closed, log the event and create a new conversation
                this.logger.info("conversation.cache.expired_or_closed", {
                    clientId,
                    businessId,
                    conversationId: cachedState.conversationId,
                    state: cachedState.state,
                    updatedAt: cachedState.updatedAt
                });
                return this.createAndCacheConversation(clientId, businessId, initialContent);
            }
        }

        this.logger.info("conversation.cache.miss", {
            clientId,
            businessId,
            activeConversationId
        });
        // If no active conversation ID exists or if the cached state is not found, check the database for the latest conversation state
        const latestState = await this.sqlInterface.getLatestConversationCacheState(clientId, businessId);
        if (latestState && this.shouldContinueConversation(latestState, now)) {
            await this.cacheManager.setCacheStateByConversationId(latestState.conversationId, latestState);
            await this.cacheManager.setActiveConversationId(clientId, businessId, latestState.conversationId);
            this.logger.info("conversation.db.hit", {
                clientId,
                businessId,
                conversationId: latestState.conversationId,
                state: latestState.state,
                lastMessagesCount: latestState.lastMessages.length
            });
            return latestState;
        }

        if (latestState) {
            this.logger.info("conversation.db.expired_or_closed", {
                clientId,
                businessId,
                conversationId: latestState.conversationId,
                state: latestState.state,
                updatedAt: latestState.updatedAt
            });
        } else {
            this.logger.info("conversation.db.miss.creating", { clientId, businessId });
        }

        return this.createAndCacheConversation(clientId, businessId, initialContent);
    }

    private async createAndCacheConversation(clientId: number, businessId: number, initialContent: string): Promise<ConversationCacheState> {
        const conversationState = await this.sqlInterface.createDbConversation(clientId, businessId, initialContent);
        await this.cacheManager.setCacheStateByConversationId(conversationState.conversationId, conversationState);
        await this.cacheManager.setActiveConversationId(clientId, businessId, conversationState.conversationId);
        this.logger.info("conversation.created", {
            clientId,
            businessId,
            conversationId: conversationState.conversationId,
            state: conversationState.state
        });
        return conversationState;
    }

    private shouldContinueConversation(conversationState: ConversationCacheState, now: Date): boolean {
        if (CLOSED_CONVERSATION_STATES.has(conversationState.state)) {
            return false;
        }

        const updatedAt = new Date(conversationState.updatedAt);
        if (!Number.isFinite(updatedAt.getTime())) {
            return false;
        }

        return now.getTime() - updatedAt.getTime() <= CONVERSATION_TIMEOUT_MS;
    }
}
