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
import { IDatabaseClient } from "./sqlInterface";
import { LeadRepository } from "./Repositories/LeadRepo/LeadRepository";
import { ILeadRepository } from "./Repositories/LeadRepo/ILeadRepository";
import { FollowUpRepository } from "./Repositories/FollowUpRepo/FollowUpRepository";
import { IFollowUpRepository } from "./Repositories/FollowUpRepo/IFollowUpRepository";
import { BusinessChannelRepository } from "./Repositories/BusinessChannelRepo/BusinessChannelRepository";
import { IBusinessChannelRepository } from "./Repositories/BusinessChannelRepo/IBusinessChannelRepository";
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
import { ProviderWebhookEventRepository } from "./Repositories/ProviderWebhookEventRepo/ProviderWebhookEventRepository";
import { IProviderWebhookEventRepository } from "./Repositories/ProviderWebhookEventRepo/IProviderWebhookEventRepository";
import { MetaLeadFormSubscriptionRepository } from "./Repositories/MetaLeadFormSubscriptionRepo/MetaLeadFormSubscriptionRepository";
import { IMetaLeadFormSubscriptionRepository } from "./Repositories/MetaLeadFormSubscriptionRepo/IMetaLeadFormSubscriptionRepository";
import { ConversationState } from "../Types/stateMachineTypes";
import { ILogger, logger } from "../../logging/logger";
import {
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
    ConversationSummaryDto,
    PlatformRoleDto,
    UpdateBusinessSettingsParameterDto,
    UpdateBusinessSettingsRequestDto,
} from "../../contracts";


export const prisma = new PrismaClient();
const AUTO_LEAD_SCORE_THRESHOLD = 65;
const LEAD_PARAM_SCORE_WEIGHT = 0.75;
const LEAD_RESPONSE_TIME_SCORE_WEIGHT = 0.25;

export class SqlManager implements IDatabaseClient {
    private prisma: PrismaClient;
    private logger: ILogger;
    readonly leadRepository: ILeadRepository;
    readonly followUpRepository: IFollowUpRepository;
    readonly businessChannelRepository: IBusinessChannelRepository;
    readonly integrationConnectionRepository: IIntegrationConnectionRepository;
    readonly incomingLeadRepository: IIncomingLeadRepository;
    readonly externalLeadRepository: IExternalLeadRepository;
    readonly ingestionOutboxRepository: IIngestionOutboxRepository;
    readonly leadIngestionRepository: ILeadIngestionRepository;
    readonly leadProcessingRepository: ILeadProcessingRepository;
    readonly providerWebhookEventRepository: IProviderWebhookEventRepository;
    readonly metaLeadFormSubscriptionRepository: IMetaLeadFormSubscriptionRepository;

    constructor(loggerInstance: ILogger = logger.child({ component: "SqlManager" })) {
        this.prisma = prisma;
        this.logger = loggerInstance;
        this.leadRepository = new LeadRepository(this.prisma);
        this.followUpRepository = new FollowUpRepository(this.prisma);
        this.businessChannelRepository = new BusinessChannelRepository(this.prisma);
        this.integrationConnectionRepository = new IntegrationConnectionRepository(this.prisma);
        this.incomingLeadRepository = new IncomingLeadRepository(this.prisma);
        this.externalLeadRepository = new ExternalLeadRepository(this.prisma);
        this.ingestionOutboxRepository = new IngestionOutboxRepository(this.prisma);
        this.leadIngestionRepository = new LeadIngestionRepository(this.prisma);
        this.leadProcessingRepository = new LeadProcessingRepository(this.prisma);
        this.providerWebhookEventRepository = new ProviderWebhookEventRepository(this.prisma);
        this.metaLeadFormSubscriptionRepository = new MetaLeadFormSubscriptionRepository(this.prisma);
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

    async createMessage(conversationId: number,type: "user"| "bot",content: string): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const currentMax = await tx.message.aggregate({
                where: {
                    conversationId
                },
                _max: {
                    messageIndex: true
                }
            });

            const createdMessage = await tx.message.create({
                data: {
                    conversationId,
                    messageIndex: (currentMax._max.messageIndex || 0) + 1,
                    type,
                    content,
                    status: "received",
                    externalId: crypto.randomUUID()
                }
            });

            await tx.conversation.update({
                where: {
                    id: conversationId
                },
                data: type === "user"
                    ? { lastUserMessageAt: createdMessage.createdAt }
                    : { lastBotMessageAt: createdMessage.createdAt }
            });
        });
        
       
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
                paramAnswer: paramValue
            }
            });
        } else {
            await this.prisma.parameterAnswer.create({
            data: {
                clientId,
                conversationId,
                paramId: param.id,
                paramAnswer: paramValue
            }
            });
        }
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

        await this.prisma.lead.create({
            data: {
                businessId,
                clientId,
                status: "QUALIFIED" as any,
                source: "WHATSAPP" as any,
                score,
                name: client?.name || undefined,
                phoneNumber: client?.phoneNumber,
                summary: `Auto-qualified from conversation ${conversationId} with score ${score}.`
            }
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

            const normalizedParameters = normalizeBusinessSettingsParameters(request.parameters);
            const submittedParameterIds = new Set(
                normalizedParameters
                    .map((param) => param.id)
                    .filter((id): id is number => id !== undefined)
            );
            const existingParameterIds = new Set(existingBusiness.parameters.map((param) => param.id));
            const invalidParameterId = [...submittedParameterIds].find((id) => !existingParameterIds.has(id));
            if (invalidParameterId !== undefined) {
                throw new Error(`Business parameter ${invalidParameterId} does not belong to business ${businessId}`);
            }

            await tx.business.update({
                where: {
                    id: businessId
                },
                data: {
                    businessName: request.name,
                    businessPhone: request.phone,
                    businessEmail: request.email,
                    starterMessage: request.starterMessage,
                    enderMessage: request.endMessage,
                    escalationMessage: request.escalationMessage,
                    language: request.language || "en"
                }
            });

            for (const parameter of normalizedParameters) {
                if (parameter.id !== undefined) {
                    await tx.businessParameter.update({
                        where: {
                            id: parameter.id
                        },
                        data: {
                            paramName: parameter.paramName,
                            use: parameter.use
                        }
                    });
                    continue;
                }

                await tx.businessParameter.upsert({
                    where: {
                        businessId_paramName: {
                            businessId,
                            paramName: parameter.paramName
                        }
                    },
                    create: {
                        businessId,
                        paramName: parameter.paramName,
                        use: parameter.use
                    },
                    update: {
                        paramName: parameter.paramName,
                        use: parameter.use
                    }
                });
            }

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
        const parameters = await this.prisma.businessParameter.findMany({
            where: {
                businessId,
                use: true
            },
            orderBy: {
                id: "asc"
            }
        });

        return parameters.map((parameter) => parameter.paramName);
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
    //Get all clients for a given business, including the count of conversations and the timestamp of the last conversation in descending order of the last conversation timestamp. If a client has no conversations, it will not be included in the result.
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

        return conversations.map((conversation) => ({
            id: conversation.id,
            businessId: conversation.businessId,
            clientId: conversation.clientId,
            status: conversation.conversationStatus,
            conclusion: conversation.conclusion,
            createdAt: conversation.createdAt.toISOString(),
            messageCount: conversation._count.messages,
            lastMessageAt: conversation.messages[0]?.createdAt.toISOString()
        }));
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
            conversation: {
                id: conversation.id,
                businessId: conversation.businessId,
                clientId: conversation.clientId,
                status: conversation.conversationStatus,
                conclusion: conversation.conclusion,
                createdAt: conversation.createdAt.toISOString(),
                messageCount: conversation._count.messages,
                lastMessageAt: lastMessage?.createdAt.toISOString()
            },
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

function mapBusinessSettings(business: {
    id: number;
    businessName: string;
    businessPhone: string;
    businessEmail: string;
    starterMessage: string;
    enderMessage: string;
    escalationMessage: string;
    language: string;
    parameters: Array<{
        id: number;
        paramName: string;
        use: boolean;
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

        return {
            id: parameter.id,
            paramName,
            use: parameter.use ?? true
        };
    });
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
