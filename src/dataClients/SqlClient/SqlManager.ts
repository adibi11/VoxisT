import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BusinessContext, Client, ConversationEntity } from "../Types/messageTypes";
import { mapToConversationEntity } from "../Types/mappers";
import { BusinessParam } from "../Types/messageTypes";
import { BusinessActionDto, BusinessDto, MessageType } from "../Types/apiTypes";
import { CommunicationChannel, MessageProvider } from "../Types/apiTypes";
import { ConversationCacheState } from "../Types/messageTypes";
import {
    CLIENT_NAME_PARAM,
    CLIENT_NAME_NOT_PROVIDED,
    isClientNameParam
} from "../Types/clientNameParam";
import {
    BusinessParamConfig,
    BusinessParamDefinition,
    BusinessParamType,
    normalizeParamValue,
    parseBusinessParamConfig,
    parseBusinessParamType
} from "../Types/paramTypes";
import { IDatabaseClient } from "./sqlInterface";
import { LeadRepository } from "./Repositories/LeadRepo/LeadRepository";
import { ILeadRepository } from "./Repositories/LeadRepo/ILeadRepository";
import { FollowUpRepository } from "./Repositories/FollowUpRepo/FollowUpRepository";
import { IFollowUpRepository } from "./Repositories/FollowUpRepo/IFollowUpRepository";
import { BusinessChannelRepository } from "./Repositories/BusinessChannelRepo/BusinessChannelRepository";
import { IBusinessChannelRepository } from "./Repositories/BusinessChannelRepo/IBusinessChannelRepository";
import { BusinessParameterRepository } from "./Repositories/BusinessParameterRepo/BusinessParameterRepository";
import { IBusinessParameterRepository } from "./Repositories/BusinessParameterRepo/IBusinessParameterRepository";
import { IntegrationConnectionRepository } from "./Repositories/IntegrationConnectionRepo/IntegrationConnectionRepository";
import { IIntegrationConnectionRepository } from "./Repositories/IntegrationConnectionRepo/IIntegrationConnectionRepository";
import { IncomingLeadRepository } from "./Repositories/IncomingLeadRepo/IncomingLeadRepository";
import { IIncomingLeadRepository } from "./Repositories/IncomingLeadRepo/IIncomingLeadRepository";
import { ExternalLeadRepository } from "./Repositories/ExternalLeadRepo/ExternalLeadRepository";
import { IExternalLeadRepository } from "./Repositories/ExternalLeadRepo/IExternalLeadRepository";
import { IngestionOutboxRepository } from "./Repositories/IngestionOutboxRepo/IngestionOutboxRepository";
import { IIngestionOutboxRepository } from "./Repositories/IngestionOutboxRepo/IIngestionOutboxRepository";
import { LeadIngestionRepository } from "./Repositories/LeadIngestionRepo/LeadIngestionRepository";
import { ILeadIngestionRepository } from "./Repositories/LeadIngestionRepo/ILeadIngestionRepository";
import { LeadProcessingRepository } from "./Repositories/LeadProcessingRepo/LeadProcessingRepository";
import { ILeadProcessingRepository } from "./Repositories/LeadProcessingRepo/ILeadProcessingRepository";
import { LeadCreationService } from "../../Lead/LeadCreationService";
import { ProviderWebhookEventRepository } from "./Repositories/ProviderWebhookEventRepo/ProviderWebhookEventRepository";
import { IProviderWebhookEventRepository } from "./Repositories/ProviderWebhookEventRepo/IProviderWebhookEventRepository";
import { MetaLeadFormSubscriptionRepository } from "./Repositories/MetaLeadFormSubscriptionRepo/MetaLeadFormSubscriptionRepository";
import { IMetaLeadFormSubscriptionRepository } from "./Repositories/MetaLeadFormSubscriptionRepo/IMetaLeadFormSubscriptionRepository";
import { TaskRepository } from "./Repositories/TaskRepo/TaskRepository";
import { ITaskRepository } from "./Repositories/TaskRepo/ITaskRepository";
import { SchemaRepository } from "./Repositories/SchemaRepo/SchemaRepository";
import { ISchemaRepository } from "./Repositories/SchemaRepo/ISchemaRepository";
import { CaseRepository } from "./Repositories/CaseRepo/CaseRepository";
import { ICaseRepository } from "./Repositories/CaseRepo/ICaseRepository";

import { DocumentRepository } from "./Repositories/DocumentRepo/DocumentRepository";
import { IDocumentRepository } from "./Repositories/DocumentRepo/IDocumentRepository";
import { ConversationState } from "../Types/stateMachineTypes";
import { ILogger, logger } from "../../logging/logger";
import {
    AdminCreateBusinessRequestDto,
    AdminCreateUserRequestDto,
    AuthUserDto,
    BusinessActionTypeDto,
    BusinessResponseMetricsDto,
    BusinessSettingsActionDto,
    BusinessSettingsDto,
    BusinessSummaryDto,
    BusinessMemberDto,
    BusinessUserRoleDto,
    ClientSummaryDto,
    ConversationMessagesResponseDto,
    ConversationMessageDto,
    ConversationSummaryDto,
    PlatformRoleDto,
    UpdateBusinessSettingsParameterDto,
    UpdateBusinessSettingsRequestDto,
} from "../../contracts";
import { IPushDeviceRepository } from "./Repositories/PushDeviceRepo/IPushDeviceRepository";
import { PushDeviceRepository } from "./Repositories/PushDeviceRepo/PushDeviceRepository";
import { InstagramRepository } from "../../InstagramCommentAutomation/InstagramRepository";
import { IInstagramRepository } from "../../InstagramCommentAutomation/instagramTypes";


export const prisma = new PrismaClient();
const AUTO_LEAD_SCORE_THRESHOLD = 65;
const AI_SCHEDULED_LEAD_SCORE = 80;
export const AI_CALLBACK_TASK_CATEGORY = "ai_callback";
const LEAD_PARAM_SCORE_WEIGHT = 0.50;
const LEAD_RESPONSE_TIME_SCORE_WEIGHT = 0.50;

export class SqlManager implements IDatabaseClient {
    private prisma: PrismaClient;
    private logger: ILogger;
    readonly leadRepository: ILeadRepository;
    readonly followUpRepository: IFollowUpRepository;
    readonly businessChannelRepository: IBusinessChannelRepository;
    readonly businessParameterRepository: IBusinessParameterRepository;
    readonly integrationConnectionRepository: IIntegrationConnectionRepository;
    readonly incomingLeadRepository: IIncomingLeadRepository;
    readonly externalLeadRepository: IExternalLeadRepository;
    readonly ingestionOutboxRepository: IIngestionOutboxRepository;
    readonly leadIngestionRepository: ILeadIngestionRepository;
    readonly leadProcessingRepository: ILeadProcessingRepository;
    readonly providerWebhookEventRepository: IProviderWebhookEventRepository;
    readonly metaLeadFormSubscriptionRepository: IMetaLeadFormSubscriptionRepository;
    readonly taskRepository: ITaskRepository;
    readonly schemaRepository: ISchemaRepository;
    readonly caseRepository: ICaseRepository;
    
    readonly documentRepository: IDocumentRepository;
    readonly pushDeviceRepository: IPushDeviceRepository;
    readonly instagramRepository: IInstagramRepository;

    constructor(loggerInstance: ILogger = logger.child({ component: "SqlManager" })) {
        this.prisma = prisma;
        this.logger = loggerInstance;
        this.leadRepository = new LeadRepository(this.prisma);
        this.followUpRepository = new FollowUpRepository(this.prisma);
        this.businessChannelRepository = new BusinessChannelRepository(this.prisma);
        this.businessParameterRepository = new BusinessParameterRepository(this.prisma);
        this.integrationConnectionRepository = new IntegrationConnectionRepository(this.prisma);
        this.incomingLeadRepository = new IncomingLeadRepository(this.prisma);
        this.externalLeadRepository = new ExternalLeadRepository(this.prisma);
        this.ingestionOutboxRepository = new IngestionOutboxRepository(this.prisma);
        this.leadIngestionRepository = new LeadIngestionRepository(this.prisma);
        this.leadProcessingRepository = new LeadProcessingRepository(this.prisma);
        this.providerWebhookEventRepository = new ProviderWebhookEventRepository(this.prisma);
        this.metaLeadFormSubscriptionRepository = new MetaLeadFormSubscriptionRepository(this.prisma);
        this.taskRepository = new TaskRepository(this.prisma);
        this.schemaRepository = new SchemaRepository(this.prisma);
        this.caseRepository = new CaseRepository(this.prisma);
        
        this.documentRepository = new DocumentRepository(this.prisma);
        this.pushDeviceRepository = new PushDeviceRepository(this.prisma);
        this.instagramRepository = new InstagramRepository(this.prisma);
    }   

    getPrismaClient(): PrismaClient {
        return this.prisma;
    }

    async getBusiness(businessId: number): Promise<BusinessDto | null> {
        const business = await this.prisma.business.findUnique({
            where: {    
                id: businessId
            }
        });
        if (!business) {
            return null;
        }   
        return {
            name: business.businessName,
            phone: business.businessPhone,
            email: business.businessEmail,
            parameters: [], // You can implement fetching parameters if needed
            starterMessage: business.starterMessage,
            endMessage: business.enderMessage,
            escalationMessage: business.escalationMessage,
        };
    }

    async getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null> {
        return this.getLatestConversationCacheState(clientId, businessId);
    }

    async getLatestConversationCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null> {
        const conversations = await this.prisma.conversation.findMany({
            where: {
                clientId: clientId,
                businessId: businessId
            },
            include: {
                messages: {
                    orderBy: [
                        { messageIndex: "desc" },
                        { id: "desc" }
                    ],
                    take: 1
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        const conversation = conversations
            .sort((left, right) => getConversationActivityTime(right).getTime() - getConversationActivityTime(left).getTime())[0];

        if (!conversation) {
            return null;
        }
        return this.getCacheStateByConversationId(conversation.id);
    }

    async getCacheStateByConversationId(conversationId: number): Promise<ConversationCacheState | null> {
        const conversation = await this.prisma.conversation.findUnique({
            where: {
                id: conversationId
            }
        });
        if (!conversation) {
            return null;
        }
        // Fetch messages for the conversation by ascending order of messageIndex and id
        const messages = await this.prisma.message.findMany({
            where: {
                conversationId: conversation.id
            },
            orderBy: [
                { messageIndex: "asc" },
                { id: "asc" }
            ]
        });
        const paramList: BusinessParam[] = await this.getBusinessParams(conversation.businessId, conversation.clientId, conversation.id);
        const client = await this.prisma.client.findUnique({
            where: {
                id: conversation.clientId
            }
        });
        if (!client) {
            return null;
        }
        const lastMessage = messages[messages.length - 1];
        return {
            conversationId:  conversation.id ,
            state: mapConversationStatusToState(conversation.conversationStatus),
            channel: mapCommunicationChannel(conversation.channel),
            provider: mapMessageProvider(conversation.provider),
            lastMessages: messages.map(msg => ({
                role: msg.type as "user" | "bot",
                content: msg.content
            })),
            collectedParams: paramList.reduce((acc, param) => {
                if (param.paramValue) {
                    acc[param.paramName] = param.paramValue;
                }
                else {
                    acc[param.paramName] = null;
                }
                return acc;
            }, {} as Record<string, string|null>),
            phone: client.phoneNumber,
            updatedAt: lastMessage?.createdAt || conversation.createdAt
        };

    }

    async getConversationEntity(clientId: number, businessId: number): Promise<ConversationEntity> {
        // Fetch conversation with all relations
        const conversation = await this.prisma.conversation.findFirst({
            where: {
                clientId: clientId,
                businessId: businessId
            },
            include: {
                messages: true,
                business: true,
                client: true
            }
        });
     

        const paramList: BusinessParam[] = await this.getBusinessParams(businessId, clientId, conversation ? conversation.id : undefined);


        if (!conversation) {
            throw new Error("No conversation found for the given client and business IDs");             
        }
        // Extract nested data (avoiding null assertions with fallback queries if needed)
        const business = conversation.business;
        const client = conversation.client;
        
        if (!business) {
            throw new Error("Conversation missing associated business ");
        }
        
        // Map Prisma types to internal types for type safety
        return mapToConversationEntity(conversation, business, client, paramList as BusinessParam[]);
    }

    async getBusinessParams(businessId: number, clientId: number, conversationId: number | undefined): Promise<BusinessParam[]> {
        const businessParams = await this.prisma.businessParameter.findMany({
            where: {
                businessId: businessId,
                use: true
            }
        });
        const client = await this.prisma.client.findUnique({
            where: {
                id: clientId
            }
        });
        const paramAnswers = await this.prisma.parameterAnswer.findMany({
            where: {
                clientId: clientId,
                paramId: {in: businessParams.map(param => param.id)
                },
                conversationId: conversationId
            }
        });
        //Create list of params and answers
        const answersMap = new Map(paramAnswers.map(a => [a.paramId, a]));

        const paramList: BusinessParam[] = businessParams.map(param => {
            const answer = answersMap.get(param.id);

                    return {
                    paramName: param.paramName,
                    paramValue: answer?.paramAnswer,
                    businessId: param.businessId
                };
            }
        );
        const savedClientName = client?.name && client.name !== CLIENT_NAME_NOT_PROVIDED ? client.name : undefined;
        const nameParam = paramList.find((param) => isClientNameParam(param.paramName));
        if (nameParam && !nameParam.paramValue && savedClientName) {
            nameParam.paramValue = savedClientName;
        }

        return paramList;
    }

    async createMessage(
        conversationId: number,
        type: "user" | "bot" | "human",
        content: string,
        idempotencyKey?: string
    ): Promise<ConversationMessageDto> {
        const createdMessage = await this.prisma.$transaction(async (tx) => {
            if (idempotencyKey) {
                const existingMessage = await tx.message.findUnique({
                    where: { externalId: idempotencyKey }
                });
                if (existingMessage) {
                    if (existingMessage.conversationId !== conversationId) {
                        throw new Error("Message idempotency key belongs to another conversation");
                    }
                    if (existingMessage.type !== type || existingMessage.content !== content) {
                        throw new Error("Message idempotency key was reused with different content");
                    }
                    return existingMessage;
                }
            }

            const currentMax = await tx.message.aggregate({
                where: {
                    conversationId
                },
                _max: {
                    messageIndex: true
                }
            });

            const persistedMessage = await tx.message.create({
                data: {
                    conversationId,
                    messageIndex: (currentMax._max.messageIndex || 0) + 1,
                    type,
                    content,
                    status: "received",
                    externalId: idempotencyKey || crypto.randomUUID()
                }
            });

            // "human" messages are agent-authored, same as "bot" - both are
            // outbound from the business side, so both bump lastBotMessageAt.
            await tx.conversation.update({
                where: {
                    id: conversationId
                },
                data: type === "user"
                    ? { lastUserMessageAt: persistedMessage.createdAt }
                    : { lastBotMessageAt: persistedMessage.createdAt }
            });

            return persistedMessage;
        });

        return {
            id: createdMessage.id,
            conversationId: createdMessage.conversationId,
            type: createdMessage.type,
            content: createdMessage.content,
            status: createdMessage.status,
            createdAt: createdMessage.createdAt.toISOString()
        };
    }

    async createDbConversation(
        clientId: number,
        businessId: number,
        content: string,
        channel: CommunicationChannel = CommunicationChannel.Whatsapp,
        provider: MessageProvider = MessageProvider.Twilio
    ): Promise<ConversationCacheState> {
        const conversation = await this.prisma.conversation.create({
            data: {
                clientId: clientId,
                businessId: businessId,
                conclusion:  content,
                conversationStatus: "start",
                channel,
                provider,
            },
        });
        const state = await this.getCacheStateByConversationId(conversation.id);
        if (!state) {
            throw new Error("Failed to create and retrieve conversation state.");
        }
        return state;
        
    }

    async createDbBusiness(businessDto: BusinessDto): Promise<void> {
        const business = await this.prisma.business.create({
            data: {
                businessName: businessDto.name,
                businessPhone: businessDto.phone,
                businessEmail: businessDto.email,
                starterMessage: businessDto.starterMessage,
                enderMessage: businessDto.endMessage,
                escalationMessage: businessDto.escalationMessage,
                language: businessDto.language || "en"

            },
        });
        const businessParamsData = businessDto.parameters.map(param => ({
            paramName: param.paramName,
            businessId: business.id,
            use: param.use ?? true
        }));
        await this.prisma.businessParameter.createMany({
            data: businessParamsData
        });
        
    }
    async getOrCreateClientByPhone(phoneNumber: string): Promise<Client> {
        let client = await this.prisma.client.findUnique({
            where: {
                phoneNumber: phoneNumber
            }
        });
        if (!client) {
            client = await this.prisma.client.create({
                data: {
                    phoneNumber: phoneNumber
                }
            });
        }
        const mappedClient: Client = {
            id: client.id,
            name: client.name || "Unknown",
            phone: client.phoneNumber,
            email: ""
        };
        return mappedClient;
    }

    async getClientPhoneNumber(clientId: number): Promise<string | null> {
        const client = await this.prisma.client.findUnique({
            where: { id: clientId },
            select: { phoneNumber: true }
        });
        return client?.phoneNumber ?? null;
    }

    async updateClientName(clientId: number, name: string): Promise<void> {
        await this.prisma.client.update({
            where: {
                id: clientId
            },
            data: {
                name
            }
        });
    }

    async upsertParamAnswer(
        clientId: number,
        conversationId: number,
        businessId: number,
        paramName: string,
        paramValue: string
        ): Promise<void> {

        let param = await this.prisma.businessParameter.findFirst({
            where: {
            businessId,
            paramName
            }
        });

        if (!param && isClientNameParam(paramName)) {
            const businessParams = await this.prisma.businessParameter.findMany({
                where: {
                    businessId
                }
            });
            param = businessParams.find((businessParam) => isClientNameParam(businessParam.paramName)) || await this.prisma.businessParameter.create({
                data: {
                    businessId,
                    paramName: CLIENT_NAME_PARAM
                }
            });
        }

        if (!param) {
            // Log a warning if the parameter is not found for the given business
            //Should not happen
            this.logger.warn("param.not_found", {
                businessId,
                paramName
            });
            return;
        }

        const typedValues = this.buildTypedAnswerValues(param, paramValue);

        const existing = await this.prisma.parameterAnswer.findFirst({
            where: {
            clientId,
            conversationId,
            paramId: param.id
            }
        });

        if (existing) {
            await this.prisma.parameterAnswer.update({
            where: {
                id: existing.id
            },
            data: {
                paramAnswer: paramValue,
                ...typedValues
            }
            });
        } else {
            await this.prisma.parameterAnswer.create({
            data: {
                clientId,
                conversationId,
                paramId: param.id,
                paramAnswer: paramValue,
                ...typedValues
            }
            });
        }
    }

    // Projects the raw answer into the typed column matching the parameter's
    // value space, so answers are queryable/learnable without re-parsing text.
    private buildTypedAnswerValues(
        param: { id: number; paramName: string; paramType: string; config: Prisma.JsonValue | null },
        paramValue: string
    ): { valueCategory: string | null; valueNumber: number | null; valueTime: Date | null } {
        const definition: BusinessParamDefinition = {
            id: param.id,
            paramName: param.paramName,
            type: parseBusinessParamType(param.paramType),
            config: parseBusinessParamConfig(param.config)
        };
        const normalized = normalizeParamValue(definition, paramValue);
        const typedValues = { valueCategory: null as string | null, valueNumber: null as number | null, valueTime: null as Date | null };

        if (!normalized.ok) {
            this.logger.warn("param.answer.normalization_failed", {
                paramId: param.id,
                paramName: param.paramName,
                paramType: definition.type,
                reason: normalized.reason
            });
            return typedValues;
        }

        switch (normalized.type) {
            case BusinessParamType.Categorical:
                typedValues.valueCategory = normalized.value;
                break;
            case BusinessParamType.Continuous:
                typedValues.valueNumber = normalized.value;
                break;
            case BusinessParamType.Time:
                typedValues.valueTime = new Date(normalized.value);
                break;
            case BusinessParamType.Text:
                break;
        }

        return typedValues;
    }

    async upsertConversationScheduledTask(args: {
        businessId: number;
        clientId: number;
        conversationId: number;
        scheduledFor: Date;
        clientName?: string | null;
        clientPhone?: string | null;
        summary?: string | null;
    }): Promise<{ taskId: number; created: boolean }> {
        const { businessId, clientId, conversationId, scheduledFor } = args;
        const scheduledForIso = scheduledFor.toISOString();
        const buinessOwnerId = (await this.getBusinessMembers(businessId)).find(u=> u.role == "owner")?.userId;

        return this.prisma.$transaction(async (tx) => {
            // A client who agreed to a callback is a qualified lead; make sure one exists.
            let lead = await tx.lead.findFirst({
                where: {
                    businessId,
                    clientId,
                    status: { notIn: ["WON", "LOST", "CLOSED"] as any }
                },
                orderBy: { createdAt: "desc" }
            });

            if (!lead) {
                lead = await tx.lead.create({
                    data: {
                        businessId,
                        clientId,
                        conversationId,
                        status: "QUALIFIED" as any,
                        source: "WHATSAPP" as any,
                        origin: "CONVERSATION" as any,
                        score: AI_SCHEDULED_LEAD_SCORE,
                        name: args.clientName || null,
                        phoneNumber: args.clientPhone || null,
                        summary: "Client agreed to a scheduled callback."
                    }
                });
                await tx.businessActivityEvent.create({
                    data: {
                        businessId,
                        aggregateType: "LEAD",
                        aggregateId: lead.id,
                        eventType: "LEAD_CREATED",
                        dedupeKey: `lead:${lead.id}:created`
                    }
                });
            }

            const clientLabel = args.clientName || args.clientPhone || "client";
            const description = args.summary || `AI-scheduled callback from conversation ${conversationId}.`;
            const activityMetadata = {
                conversationId,
                clientId,
                scheduledFor: scheduledForIso,
                origin: "ai"
            };

            const existingTask = await tx.task.findFirst({
                where: {
                    businessId,
                    leadId: lead.id,
                    category: AI_CALLBACK_TASK_CATEGORY,
                    status: { in: ["OPEN", "IN_PROGRESS"] as any },
                    deletedAt: null
                },
                orderBy: { createdAt: "desc" }
            });

            if (existingTask) {
                await tx.task.update({
                    where: { id: existingTask.id },
                    data: {
                        startsAt: scheduledFor,
                        dueAt: scheduledFor,
                        description,
                        version: { increment: 1 }
                    }
                });
                await tx.businessActivityEvent.create({
                    data: {
                        businessId,
                        aggregateType: "TASK",
                        aggregateId: existingTask.id,
                        eventType: "TASK_UPDATED",
                        metadata: activityMetadata,
                        dedupeKey: `task:${existingTask.id}:ai_reschedule:${scheduledForIso}`
                    }
                });
                return { taskId: existingTask.id, created: false };
            }

            if (!buinessOwnerId) {
                throw new Error(`Cannot schedule an AI callback task for business ${businessId}: no owner found`);
            }

            // Assigned to the owner by default; the owner can reassign to an employee.
            const task = await tx.task.create({
                data: {
                    businessId,
                    leadId: lead.id,
                    headline: `Callback: ${clientLabel}`,
                    description,
                    category: AI_CALLBACK_TASK_CATEGORY,
                    status: "OPEN" as any,
                    priority: "HIGH" as any,
                    startsAt: scheduledFor,
                    dueAt: scheduledFor,
                    timezone: "UTC",
                    createdByUserId: buinessOwnerId,
                    updatedByUserId: buinessOwnerId
                }
            });
            await tx.taskParticipant.create({
                data: {
                    businessId,
                    taskId: task.id,
                    userId: buinessOwnerId,
                    role: "MAIN_ASSIGNEE" as any,
                    addedByUserId: buinessOwnerId
                }
            });
            await tx.businessActivityEvent.create({
                data: {
                    businessId,
                    aggregateType: "TASK",
                    aggregateId: task.id,
                    eventType: "TASK_CREATED",
                    metadata: activityMetadata,
                    dedupeKey: `task:${task.id}:created`
                }
            });
            return { taskId: task.id, created: true };
        });
    }

    async getBusinessResponseMetrics(
        businessId: number,
        from: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        to: Date = new Date()
    ): Promise<BusinessResponseMetricsDto> {
        const conversations = await this.prisma.conversation.findMany({
            where: {
                businessId,
                createdAt: {
                    gte: from,
                    lte: to
                }
            },
            include: {
                messages: {
                    orderBy: [
                        { messageIndex: "asc" },
                        { id: "asc" }
                    ]
                }
            }
        });
        const responseTimes = collectResponseTimes(conversations, "user", "bot");
        const averageResponseTimeMs = average(responseTimes);

        return {
            businessId,
            from: from.toISOString(),
            to: to.toISOString(),
            averageResponseTimeMs,
            averageResponseTimeSeconds: averageResponseTimeMs === null ? null : Math.round(averageResponseTimeMs / 1000),
            responsePairCount: responseTimes.length,
            conversationCount: conversations.length
        };
    }

    async scoreAndCreateLeadForConversation(
        clientId: number,
        businessId: number,
        conversationId: number
    ): Promise<void> {
        
        

        const score = await this.calculateLeadScore(clientId, businessId, conversationId);
        const existingLead = await this.prisma.lead.findFirst({
            where: {
                businessId,
                clientId,
                status: {
                    notIn: ["WON", "LOST", "CLOSED"] as any
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        if (existingLead) {
            await this.prisma.lead.update({
                where: {
                    id: existingLead.id
                },
                data: {
                    score,
                    status: score >= AUTO_LEAD_SCORE_THRESHOLD ? "QUALIFIED" as any : existingLead.status
                }
            });
            return;
        }

        if (score < AUTO_LEAD_SCORE_THRESHOLD) {
            return;
        }

        const client = await this.prisma.client.findUnique({
            where: {
                id: clientId
            }
        });

        await new LeadCreationService(this.prisma).createConversationLead({
            businessId,
            clientId,
            conversationId,
            score,
            name: client?.name,
            phoneNumber: client?.phoneNumber,
            summary: `Auto-qualified from conversation ${conversationId} with score ${score}.`
        });
    }

    private async calculateLeadScore(clientId: number, businessId: number, conversationId: number): Promise<number> {
        const activeParameters = await this.prisma.businessParameter.findMany({
            where: {
                businessId,
                use: true
            }
        });
        if (activeParameters.length === 0) {
            return 0;
        }

        const answers = await this.prisma.parameterAnswer.findMany({
            where: {
                clientId,
                conversationId,
                paramId: {
                    in: activeParameters.map((parameter) => parameter.id)
                }
            },
            distinct: ["paramId"]
        });
        const parameterCompletionScore = answers.length / activeParameters.length;
        const responseTimeScore = await this.calculateConversationResponseTimeScore(businessId, conversationId);
        return Math.max(0, Math.min(100, Math.round(100 * (
            parameterCompletionScore * LEAD_PARAM_SCORE_WEIGHT +
            responseTimeScore * LEAD_RESPONSE_TIME_SCORE_WEIGHT
        ))));
    }

    private async calculateConversationResponseTimeScore(businessId: number, conversationId: number): Promise<number> {
        const conversation = await this.prisma.conversation.findUnique({
            where: {
                id: conversationId
            },
            include: {
                messages: {
                    orderBy: [
                        { messageIndex: "asc" },
                        { id: "asc" }
                    ]
                }
            }
        });
        if (!conversation) {
            return 1;
        }

        const conversationResponseTimes = collectResponseTimes([conversation], "bot", "user");
        const conversationAverage = average(conversationResponseTimes);
        if (conversationAverage === null) {
            return 1;
        }

        const businessAverage = await this.getBusinessClientResponseAverageMs(businessId);
        if (businessAverage === null || businessAverage <= 0) {
            return 1;
        }

        return Math.max(0, Math.min(1, businessAverage / conversationAverage));
    }

    private async getBusinessClientResponseAverageMs(businessId: number): Promise<number | null> {
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const conversations = await this.prisma.conversation.findMany({
            where: {
                businessId,
                createdAt: {
                    gte: from
                }
            },
            include: {
                messages: {
                    orderBy: [
                        { messageIndex: "asc" },
                        { id: "asc" }
                    ]
                }
            }
        });

        return average(collectResponseTimes(conversations, "bot", "user"));
    }
    // Register a new business owner and create the associated business in a single transaction
    async registerBusinessOwner(email: string, passwordHash: string, displayName: string | undefined, businessDto: BusinessDto, platformRole: PlatformRoleDto = "user"): Promise<AuthUserDto> {
        // Registration is transactional: the UI owner and business must be created together.
        const user = await this.prisma.$transaction(async (tx) => {
            const business = await tx.business.create({
                data: {
                    businessName: businessDto.name,
                    businessPhone: businessDto.phone,
                    businessEmail: businessDto.email,
                    starterMessage: businessDto.starterMessage,
                    enderMessage: businessDto.endMessage,
                    escalationMessage: businessDto.escalationMessage,
                    language: businessDto.language || "en",
                    parameters: {
                        createMany: {
                            data: businessDto.parameters.map((param) => ({
                                paramName: param.paramName,
                                use: param.use ?? true
                            }))
                        }
                    }
                }
            });

            const userData: any = {
                    email: email.toLowerCase(),
                    passwordHash,
                    displayName,
                    platformRole,
                    businesses: {
                        create: {
                            businessId: business.id,
                            role: "owner"
                        }
                    }
                };

            return tx.appUser.create({
                data: userData,
                include: {
                    businesses: true
                }
            });
        });

        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            platformRole: (user as any).platformRole === "admin" ? "admin" : "user",
            businessIds: user.businesses.map((businessUser) => businessUser.businessId),
            businessMemberships: user.businesses.map((businessUser) => ({
                businessId: businessUser.businessId,
                role: normalizeBusinessRole(businessUser.role)
            }))
        };
    }

    async getUserWithPasswordByEmail(email: string): Promise<(AuthUserDto & { passwordHash: string }) | null> {
        const user = await this.prisma.appUser.findUnique({
            where: {
                email: email.toLowerCase()
            },
            include: {
                businesses: true
            }
        });

        if (!user) {
            return null;
        }

        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            passwordHash: user.passwordHash,
            platformRole: (user as any).platformRole === "admin" ? "admin" : "user",
            businessIds: user.businesses.map((businessUser) => businessUser.businessId),
            businessMemberships: user.businesses.map((businessUser) => ({
                businessId: businessUser.businessId,
                role: normalizeBusinessRole(businessUser.role)
            }))
        };
    }

    async getUserById(userId: number): Promise<AuthUserDto | null> {
        const user = await this.prisma.appUser.findUnique({
            where: { id: userId },
            include: { businesses: true }
        });
        return user ? mapAppUser(user) : null;
    }

    async createRefreshSession(userId: number, tokenHash: string, familyId: string, expiresAt: Date): Promise<void> {
        await this.prisma.refreshSession.create({
            data: { userId, tokenHash, familyId, expiresAt }
        });
    }

    async rotateRefreshSession(
        tokenHash: string,
        replacementHash: string,
        replacementExpiresAt: Date
    ): Promise<AuthUserDto | null> {
        return this.prisma.$transaction(async (tx) => {
            const session = await tx.refreshSession.findUnique({ where: { tokenHash } });
            if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;

            const claimed = await tx.refreshSession.updateMany({
                where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } },
                data: { revokedAt: new Date(), replacedByHash: replacementHash }
            });
            if (claimed.count !== 1) return null;

            await tx.refreshSession.create({
                data: {
                    userId: session.userId,
                    tokenHash: replacementHash,
                    familyId: session.familyId,
                    expiresAt: replacementExpiresAt
                }
            });
            const user = await tx.appUser.findUnique({
                where: { id: session.userId },
                include: { businesses: true }
            });
            return user ? mapAppUser(user) : null;
        });
    }

    async revokeRefreshSession(tokenHash: string): Promise<boolean> {
        const result = await this.prisma.refreshSession.updateMany({
            where: { tokenHash, revokedAt: null },
            data: { revokedAt: new Date() }
        });
        return result.count === 1;
    }

    async getAllUsers(): Promise<AuthUserDto[]> {
        const users = await this.prisma.appUser.findMany({
            include: {
                businesses: true
            },
            orderBy: {
                id: "asc"
            }
        });

        return users.map((user) => ({
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            platformRole: (user as any).platformRole === "admin" ? "admin" : "user",
            businessIds: user.businesses.map((businessUser) => businessUser.businessId),
            businessMemberships: user.businesses.map((businessUser) => ({
                businessId: businessUser.businessId,
                role: normalizeBusinessRole(businessUser.role)
            }))
        }));
    }

    async updateUserPassword(userId: number, passwordHash: string): Promise<AuthUserDto | null> {
        const existingUser = await this.prisma.appUser.findUnique({
            where: {
                id: userId
            }
        });

        if (!existingUser) {
            return null;
        }

        const user = await this.prisma.appUser.update({
            where: {
                id: userId
            },
            data: {
                passwordHash
            },
            include: {
                businesses: true
            }
        });

        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            platformRole: (user as any).platformRole === "admin" ? "admin" : "user",
            businessIds: user.businesses.map((businessUser) => businessUser.businessId),
            businessMemberships: user.businesses.map((businessUser) => ({
                businessId: businessUser.businessId,
                role: normalizeBusinessRole(businessUser.role)
            }))
        };
    }

    async createAppUser(request: Omit<AdminCreateUserRequestDto, "password"> & { passwordHash: string }): Promise<AuthUserDto> {
        const user = await this.prisma.appUser.create({
            data: {
                email: request.email.toLowerCase(),
                passwordHash: request.passwordHash,
                displayName: request.displayName,
                platformRole: request.platformRole || "user",
                businesses: request.businessMemberships?.length ? {
                    create: request.businessMemberships.map((membership) => ({
                        businessId: membership.businessId,
                        role: membership.role as any
                    }))
                } : undefined
            },
            include: { businesses: true }
        });

        return mapAppUser(user);
    }

    async upsertBusinessMembership(userId: number, businessId: number, role: BusinessUserRoleDto): Promise<AuthUserDto | null> {
        const userExists = await this.prisma.appUser.findUnique({ where: { id: userId }, select: { id: true } });
        const businessExists = await this.prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
        if (!userExists || !businessExists) return null;

        await this.prisma.businessUser.upsert({
            where: { userId_businessId: { userId, businessId } },
            create: { userId, businessId, role: role as any },
            update: { role: role as any }
        });
        const user = await this.prisma.appUser.findUnique({ where: { id: userId }, include: { businesses: true } });
        return user ? mapAppUser(user) : null;
    }

    async deleteBusinessMembership(userId: number, businessId: number): Promise<boolean> {
        const result = await this.prisma.businessUser.deleteMany({ where: { userId, businessId } });
        return result.count > 0;
    }

    async getBusinessMembers(businessId: number): Promise<BusinessMemberDto[]> {
        const memberships = await this.prisma.businessUser.findMany({
            where: { businessId },
            include: { user: true },
            orderBy: { createdAt: "asc" }
        });
        return memberships.map((membership) => ({
            userId: membership.userId,
            email: membership.user.email,
            displayName: membership.user.displayName,
            role: normalizeBusinessRole(membership.role),
            createdAt: membership.createdAt.toISOString()
        }));
    }

    async isBusinessMember(userId: number, businessId: number): Promise<boolean> {
        return Boolean(await this.prisma.businessUser.findUnique({
            where: { userId_businessId: { userId, businessId } },
            select: { id: true }
        }));
    }

    async getAllBusinesses(): Promise<BusinessSummaryDto[]> {
        const businesses = await this.prisma.business.findMany({
            orderBy: {
                id: "asc"
            }
        });

        return businesses.map((business) => ({
            id: business.id,
            name: business.businessName,
            phone: business.businessPhone,
            email: business.businessEmail
        }));
    }

    async createBusiness(request: AdminCreateBusinessRequestDto): Promise<BusinessSummaryDto> {
        const business = await this.prisma.business.create({
            data: {
                businessName: request.name.trim(),
                businessPhone: request.phone.trim(),
                businessEmail: request.email.trim(),
                language: request.language?.trim() || "en"
            }
        });
        return {
            id: business.id,
            name: business.businessName,
            phone: business.businessPhone,
            email: business.businessEmail
        };
    }

    async getBusinessSettings(businessId: number): Promise<BusinessSettingsDto | null> {
        const business = await this.prisma.business.findUnique({
            where: {
                id: businessId
            },
            include: {
                parameters: {
                    orderBy: {
                        id: "asc"
                    }
                },
                BusinessAction: true
            }
        });

        return business ? mapBusinessSettings(business) : null;
    }

    async updateBusinessSettings(businessId: number, request: UpdateBusinessSettingsRequestDto): Promise<BusinessSettingsDto> {
        const business = await this.prisma.$transaction(async (tx) => {
            const existingBusiness = await tx.business.findUnique({
                where: {
                    id: businessId
                },
                include: {
                    parameters: true
                }
            });

            if (!existingBusiness) {
                throw new Error(`Business ${businessId} not found`);
            }

            await tx.business.update({
                where: {
                    id: businessId
                },
                data: {
                    businessName: request.name,
                    businessPhone: request.phone,
                    businessEmail: request.email,
                    starterMessage: request.starterMessage === undefined ? undefined : normalizeNullableString(request.starterMessage),
                    enderMessage: request.endMessage === undefined ? undefined : normalizeNullableString(request.endMessage),
                    escalationMessage: request.escalationMessage === undefined ? undefined : normalizeNullableString(request.escalationMessage),
                    language: request.language || "en"
                }
            });

            if (request.action) {
                await tx.businessAction.upsert({
                    where: {
                        businessId
                    },
                    create: {
                        businessId,
                        action: request.action.action,
                        provider: normalizeNullableString(request.action.provider),
                        config: request.action.config === undefined ? undefined : toPrismaJson(request.action.config)
                    },
                    update: {
                        action: request.action.action,
                        provider: normalizeNullableString(request.action.provider),
                        config: request.action.config === undefined ? undefined : toPrismaJson(request.action.config)
                    }
                });
            } else {
                await tx.businessAction.deleteMany({
                    where: {
                        businessId
                    }
                });
            }

            return tx.business.findUniqueOrThrow({
                where: {
                    id: businessId
                },
                include: {
                    parameters: {
                        orderBy: {
                            id: "asc"
                        }
                    },
                    BusinessAction: true
                }
            });
        });

        return mapBusinessSettings(business);
    }

    async getActiveBusinessParameterNames(businessId: number): Promise<string[]> {
        const definitions = await this.getActiveBusinessParameterDefinitions(businessId);
        return definitions.map((definition) => definition.paramName);
    }

    async getActiveBusinessParameterDefinitions(businessId: number): Promise<BusinessParamDefinition[]> {
        const parameters = await this.prisma.businessParameter.findMany({
            where: {
                businessId,
                use: true
            },
            orderBy: {
                id: "asc"
            }
        });

        return parameters.map((parameter) => ({
            id: parameter.id,
            paramName: parameter.paramName,
            type: parseBusinessParamType(parameter.paramType),
            config: parseBusinessParamConfig(parameter.config)
        }));
    }

    async getBusinessesForUser(userId: number): Promise<BusinessSummaryDto[]> {
        const businessUsers = await this.prisma.businessUser.findMany({
            where: { userId },
            include: {
                business: true
            },
            orderBy: {
                createdAt: "asc"
            }
        });

        return businessUsers.map(({ business }) => ({
            id: business.id,
            name: business.businessName,
            phone: business.businessPhone,
            email: business.businessEmail
        }));
    }
    //Get all clients for a given business, 
    // including the count of conversations and the timestamp of the last conversation in descending order of the last conversation timestamp. 
    // If a client has no conversations, it will not be included in the result.
    async getClientsByBusiness(businessId: number): Promise<ClientSummaryDto[]> {
        const clients = await this.prisma.client.findMany({
            where: {
                conversations: {
                    some: {
                        businessId
                    }
                }
            },
            include: {
                conversations: {
                    where: { businessId },
                    orderBy: { createdAt: "desc" },
                    take: 1
                },
                _count: {
                    select: {
                        conversations: {
                            where: { businessId }
                        }
                    }
                }
            },
            orderBy: {
                id: "desc"
            }
        });

        return clients.map((client) => ({
            id: client.id,
            phoneNumber: client.phoneNumber,
            conversationCount: client._count.conversations,
            lastConversationAt: client.conversations[0]?.createdAt.toISOString()
        }));
    }

    async getConversationsByBusinessAndClient(businessId: number, clientId?: number): Promise<ConversationSummaryDto[]> {
        const conversations = await this.prisma.conversation.findMany({
            where: {
                businessId,
                ...(clientId ? { clientId } : {})
            },
            include: {
                messages: {
                    orderBy: [
                        { messageIndex: "desc" },
                        { id: "desc" }
                    ],
                    take: 1
                },
                _count: {
                    select: {
                        messages: true
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return conversations.map(mapConversationToSummaryDto);
    }

    async getMessagesByConversation(businessId: number, conversationId: number): Promise<ConversationMessagesResponseDto | null> {
        const conversation = await this.prisma.conversation.findFirst({
            where: {
                id: conversationId,
                businessId
            },
            include: {
                messages: {
                    orderBy: [
                        { messageIndex: "asc" },
                        { id: "asc" }
                    ]
                },
                parameterAnswers: {
                    include: {
                        businessParameter: true
                    },
                    orderBy: { createdAt: "asc" }
                },
                _count: {
                    select: {
                        messages: true
                    }
                }
            }
        });

        if (!conversation) {
            return null;
        }

        const lastMessage = conversation.messages[conversation.messages.length - 1];

        return {
            conversation: mapConversationToSummaryDto({
                ...conversation,
                messages: lastMessage ? [lastMessage] : []
            }),
            messages: conversation.messages.map((message) => ({
                id: message.id,
                conversationId: message.conversationId,
                type: message.type,
                content: message.content,
                status: message.status,
                createdAt: message.createdAt.toISOString()
            })),
            params: conversation.parameterAnswers.map((answer) => ({
                id: answer.id,
                paramName: answer.businessParameter.paramName,
                paramValue: answer.paramAnswer,
                createdAt: answer.createdAt.toISOString()
            }))
        };
    }

    // Read-only: identifies the same "active" conversation the bot pipeline
    // would pick (most recent activity, not just most recently created) and
    // reports whether it's human-managed. Never creates a conversation -
    // that side effect stays in MessageService's get-or-create path.
    async isConversationHumanManaged(clientId: number, businessId: number): Promise<boolean> {
        const conversations = await this.prisma.conversation.findMany({
            where: { clientId, businessId },
            select: {
                humanManaged: true,
                createdAt: true,
                messages: {
                    orderBy: [{ messageIndex: "desc" }, { id: "desc" }],
                    take: 1,
                    select: { createdAt: true }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        const conversation = conversations
            .sort((left, right) => getConversationActivityTime(right).getTime() - getConversationActivityTime(left).getTime())[0];

        return conversation?.humanManaged ?? false;
    }

    async getConversationForBusinessAndClient(businessId: number, clientId: number, conversationId: number): Promise<ConversationSummaryDto | null> {
        const conversation = await this.prisma.conversation.findFirst({
            where: { id: conversationId, businessId, clientId },
            include: {
                messages: {
                    orderBy: [{ messageIndex: "desc" }, { id: "desc" }],
                    take: 1
                },
                _count: { select: { messages: true } }
            }
        });

        return conversation ? mapConversationToSummaryDto(conversation) : null;
    }

    async setHumanTakeover(conversationId: number, userId: number): Promise<ConversationSummaryDto> {
        const conversation = await this.prisma.conversation.update({
            where: { id: conversationId },
            data: {
                conversationStatus: "humanTakeover",
                humanManaged: true,
                takenOverByUserId: userId,
                takenOverAt: new Date()
            },
            include: {
                messages: {
                    orderBy: [{ messageIndex: "desc" }, { id: "desc" }],
                    take: 1
                },
                _count: { select: { messages: true } }
            }
        });

        return mapConversationToSummaryDto(conversation);
    }

    async releaseHumanTakeover(conversationId: number): Promise<ConversationSummaryDto> {
        const conversation = await this.prisma.conversation.update({
            where: { id: conversationId },
            data: {
                conversationStatus: "ended",
                releasedAt: new Date()
            },
            include: {
                messages: {
                    orderBy: [{ messageIndex: "desc" }, { id: "desc" }],
                    take: 1
                },
                _count: { select: { messages: true } }
            }
        });

        return mapConversationToSummaryDto(conversation);
    }

    async createHumanConversation(
        clientId: number,
        businessId: number,
        userId: number,
        channel: CommunicationChannel = CommunicationChannel.Whatsapp,
        provider: MessageProvider = MessageProvider.Twilio
    ): Promise<ConversationSummaryDto> {
        const conversation = await this.prisma.conversation.create({
            data: {
                clientId,
                businessId,
                conversationStatus: "humanTakeover",
                humanManaged: true,
                takenOverByUserId: userId,
                takenOverAt: new Date(),
                channel,
                provider
            },
            include: {
                messages: true,
                _count: { select: { messages: true } }
            }
        });

        return mapConversationToSummaryDto(conversation);
    }

    async createConversationMessageActivityEvent(businessId: number, conversationId: number, messageId: number): Promise<void> {
        await this.prisma.businessActivityEvent.create({
            data: {
                businessId,
                aggregateType: "CONVERSATION",
                aggregateId: conversationId,
                eventType: "CONVERSATION_MESSAGE_RECEIVED",
                dedupeKey: `message:${messageId}:conversation_message_received`
            }
        });
    }

    async getBusinessContext(businessId: number): Promise<BusinessContext | null> {
        const context = await this.prisma.businessContext.findUnique({
            where: {
                businessId
            }
        });

        return context ? mapPrismaBusinessContext(context) : null;
    }

    async upsertBusinessContext(context: BusinessContext): Promise<BusinessContext> {
        const savedContext = await this.prisma.businessContext.upsert({
            where: {
                businessId: context.businessId
            },
            create: {
                businessId: context.businessId,
                profileName: context.businessProfile.name,
                profileLanguage: context.businessProfile.language,
                profileTone: context.businessProfile.tone,
                description: context.description,
                serviceCatalog: toPrismaJson(context.serviceCatalog),
                conversationPolicy: toPrismaJson(context.conversationPolicy),
                knownClientContext: context.knownClientContext === undefined
                    ? undefined
                    : toPrismaJson(context.knownClientContext)
            },
            update: {
                profileName: context.businessProfile.name,
                profileLanguage: context.businessProfile.language,
                profileTone: context.businessProfile.tone,
                description: context.description,
                serviceCatalog: toPrismaJson(context.serviceCatalog),
                conversationPolicy: toPrismaJson(context.conversationPolicy),
                knownClientContext: context.knownClientContext === undefined
                    ? undefined
                    : toPrismaJson(context.knownClientContext)
            }
        });

        return mapPrismaBusinessContext(savedContext);
    }

    async updateConversationState(conversationId: number, state: ConversationState): Promise<void> {
        await this.prisma.conversation.update({
            where: {
                id: conversationId
            },
            data: {
                conversationStatus: mapConversationStateToStatus(state)
            }
        });
    }

    async upsertBusiness(businessDto: BusinessDto, businessId: number): Promise<BusinessDto> {
        const business = await this.prisma.business.upsert({
            where: {
                id: businessId
            },
            create: {
                businessName: businessDto.name,
                businessPhone: businessDto.phone,
                businessEmail: businessDto.email,
                starterMessage: businessDto.starterMessage,
                enderMessage: businessDto.endMessage,
                escalationMessage: businessDto.escalationMessage,
                language: businessDto.language || "en"
            },
            update: {
                businessName: businessDto.name,
                businessPhone: businessDto.phone,
                businessEmail: businessDto.email,
                starterMessage: businessDto.starterMessage,
                enderMessage: businessDto.endMessage,
                escalationMessage: businessDto.escalationMessage,
                language: businessDto.language || "en"
            }
        });
        return {
            name: business.businessName,
            phone: business.businessPhone,
            email: business.businessEmail,
            parameters: [], // You can implement fetching parameters if needed
            starterMessage: business.starterMessage,
            endMessage: business.enderMessage,
            escalationMessage: business.escalationMessage,
            language: business.language
        };
    }

   async upsertBusinessAction(businessId: number, actionDto: BusinessActionDto): Promise<void> {
        await this.prisma.businessAction.upsert({
            where: {
                businessId: businessId
            },
            create: {
                businessId: businessId,
                action: actionDto.action,
                provider: actionDto.provider,
                config: actionDto.config
            },
            update: {
                action: actionDto.action,
                provider: actionDto.provider,
                config: actionDto.config
            }
        });
    }

    async getBusinessAction(businessId: number): Promise<BusinessActionDto> {
        const action = await this.prisma.businessAction.findUnique({
            where: {
                businessId: businessId
            }
        });

        if (!action) {
            throw new Error(`No action found for business ID ${businessId}`);
        }

        return {
            action: action.action,
            provider: action.provider || undefined,
            config: action.config || undefined,
            businessId: action.businessId
        };
    }

   
       
}

function mapAppUser(user: any): AuthUserDto {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        platformRole: user.platformRole === "admin" ? "admin" : "user",
        businessIds: user.businesses.map((membership: any) => membership.businessId),
        businessMemberships: user.businesses.map((membership: any) => ({
            businessId: membership.businessId,
            role: normalizeBusinessRole(membership.role)
        }))
    };
}

function normalizeBusinessRole(role: string): BusinessUserRoleDto {
    return role === "owner" ? "owner" : "member";
}
function mapConversationStatusToState(status: string): ConversationState {
    if (Object.values(ConversationState).includes(status as ConversationState)) {
        return status as ConversationState;
    }

    if (status === "done") return ConversationState.ended;
    if (status === "middle") return ConversationState.collecting;
    if (status === "failed") return ConversationState.failure;

    return ConversationState.start;
}

function mapConversationStateToStatus(state: ConversationState): any {
    return state;
}

function mapConversationToSummaryDto(conversation: {
    id: number;
    businessId: number;
    clientId: number;
    conversationStatus: string;
    channel: string;
    provider: string;
    conclusion: string | null;
    createdAt: Date;
    humanManaged: boolean;
    takenOverByUserId: number | null;
    takenOverAt: Date | null;
    releasedAt: Date | null;
    messages: { createdAt: Date }[];
    _count: { messages: number };
}): ConversationSummaryDto {
    return {
        id: conversation.id,
        businessId: conversation.businessId,
        clientId: conversation.clientId,
        status: conversation.conversationStatus,
        channel: conversation.channel,
        provider: conversation.provider,
        conclusion: conversation.conclusion,
        createdAt: conversation.createdAt.toISOString(),
        messageCount: conversation._count.messages,
        lastMessageAt: conversation.messages[0]?.createdAt.toISOString(),
        humanManaged: conversation.humanManaged,
        takenOverByUserId: conversation.takenOverByUserId,
        takenOverAt: conversation.takenOverAt?.toISOString() ?? null,
        releasedAt: conversation.releasedAt?.toISOString() ?? null
    };
}

function mapBusinessSettings(business: {
    id: number;
    businessName: string;
    businessPhone: string;
    businessEmail: string;
    starterMessage: string | null;
    enderMessage: string | null;
    escalationMessage: string | null;
    language: string;
    parameters: Array<{
        id: number;
        paramName: string;
        use: boolean;
        paramType: string;
        config: Prisma.JsonValue | null;
    }>;
    BusinessAction?: {
        action: string;
        provider: string | null;
        config: Prisma.JsonValue | null;
    } | null;
}): BusinessSettingsDto {
    return {
        id: business.id,
        name: business.businessName,
        phone: business.businessPhone,
        email: business.businessEmail,
        starterMessage: business.starterMessage,
        endMessage: business.enderMessage,
        escalationMessage: business.escalationMessage,
        language: business.language,
        parameters: business.parameters.map((param) => ({
            id: param.id,
            paramName: param.paramName,
            use: param.use,
            paramType: parseBusinessParamType(param.paramType),
            config: param.config ? parseBusinessParamConfig(param.config) : null,
            paramValue: null
        })),
        action: business.BusinessAction
            ? mapBusinessSettingsAction(business.BusinessAction)
            : null
    };
}

function mapBusinessSettingsAction(action: {
    action: string;
    provider: string | null;
    config: Prisma.JsonValue | null;
}): BusinessSettingsActionDto {
    return {
        action: action.action as BusinessActionTypeDto,
        provider: action.provider,
        config: action.config
    };
}

function normalizeBusinessSettingsParameters(parameters: UpdateBusinessSettingsParameterDto[]): Array<{
    id?: number;
    paramName: string;
    use: boolean;
    paramType: BusinessParamType;
    config: BusinessParamConfig | null;
}> {
    const seenParamNames = new Set<string>();
    return parameters.map((parameter) => {
        const paramName = parameter.paramName?.trim();
        if (!paramName) {
            throw new Error("Business parameter name is required");
        }

        const normalizedKey = paramName.toLowerCase();
        if (seenParamNames.has(normalizedKey)) {
            throw new Error(`Duplicate business parameter name: ${paramName}`);
        }
        seenParamNames.add(normalizedKey);

        const { paramType, config } = normalizeBusinessParameterTyping(paramName, parameter);

        return {
            id: parameter.id,
            paramName,
            use: parameter.use ?? true,
            paramType,
            config
        };
    });
}

// Owner-defined parameters must live in an ML-ready value space; free text is
// reserved for the system "Name" parameter so answers stay learnable.
function normalizeBusinessParameterTyping(
    paramName: string,
    parameter: UpdateBusinessSettingsParameterDto
): { paramType: BusinessParamType; config: BusinessParamConfig | null } {
    if (isClientNameParam(paramName)) {
        return { paramType: BusinessParamType.Text, config: null };
    }

    const paramType = parseBusinessParamType(parameter.paramType);
    const config = parseBusinessParamConfig(parameter.config);

    switch (paramType) {
        case BusinessParamType.Categorical: {
            const options = config.options || [];
            if (options.length < 2) {
                throw new Error(`Categorical parameter "${paramName}" requires at least 2 options`);
            }
            const uniqueOptions = new Set(options.map((option) => option.toLowerCase()));
            if (uniqueOptions.size !== options.length) {
                throw new Error(`Categorical parameter "${paramName}" has duplicate options`);
            }
            return { paramType, config: { options } };
        }
        case BusinessParamType.Continuous: {
            if (config.min !== undefined && config.max !== undefined && config.min >= config.max) {
                throw new Error(`Continuous parameter "${paramName}" requires min < max`);
            }
            return {
                paramType,
                config: {
                    ...(config.min !== undefined ? { min: config.min } : {}),
                    ...(config.max !== undefined ? { max: config.max } : {}),
                    ...(config.unit ? { unit: config.unit } : {})
                }
            };
        }
        case BusinessParamType.Time:
            return { paramType, config: null };
        case BusinessParamType.Text:
            throw new Error(
                `Parameter "${paramName}" must declare paramType CATEGORICAL, CONTINUOUS, or TIME`
            );
    }
}

function normalizeNullableString(value?: string | null): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
}

function mapCommunicationChannel(channel: string): CommunicationChannel {
    if (Object.values(CommunicationChannel).includes(channel as CommunicationChannel)) {
        return channel as CommunicationChannel;
    }

    return CommunicationChannel.Whatsapp;
}

function mapMessageProvider(provider: string | null | undefined): MessageProvider {
    if (provider && Object.values(MessageProvider).includes(provider as MessageProvider)) {
        return provider as MessageProvider;
    }

    return MessageProvider.Twilio;
}

function getConversationActivityTime(conversation: { createdAt: Date; messages: { createdAt: Date }[] }): Date {
    return conversation.messages[0]?.createdAt || conversation.createdAt;
}

function collectResponseTimes(
    conversations: Array<{ messages: Array<{ type: string; createdAt: Date }> }>,
    fromType: "user" | "bot",
    toType: "user" | "bot"
): number[] {
    const responseTimes: number[] = [];
    for (const conversation of conversations) {
        const messages = conversation.messages;
        for (let index = 0; index < messages.length; index += 1) {
            const message = messages[index];
            if (message.type !== fromType) {
                continue;
            }

            const response = messages.slice(index + 1).find((candidate) => candidate.type === toType);
            if (!response) {
                continue;
            }

            const diffMs = response.createdAt.getTime() - message.createdAt.getTime();
            if (diffMs >= 0) {
                responseTimes.push(diffMs);
            }
        }
    }

    return responseTimes;
}

function average(values: number[]): number | null {
    if (values.length === 0) {
        return null;
    }

    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function mapPrismaBusinessContext(context: {
    id: number;
    businessId: number;
    profileName: string;
    profileLanguage: string;
    profileTone: string;
    description: string | null;
    serviceCatalog: Prisma.JsonValue;
    conversationPolicy: Prisma.JsonValue;
    knownClientContext: Prisma.JsonValue | null;
}): BusinessContext {
    return {
        id: context.id,
        businessId: context.businessId,
        businessProfile: {
            name: context.profileName,
            language: context.profileLanguage,
            tone: context.profileTone
        },
        description: context.description,
        serviceCatalog: context.serviceCatalog,
        conversationPolicy: context.conversationPolicy,
        knownClientContext: context.knownClientContext ?? undefined
    };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

