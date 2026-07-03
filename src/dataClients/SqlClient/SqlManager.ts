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
import { ConversationState } from "../Types/stateMachineTypes";
import { ILogger, logger } from "../../logging/logger";
import {
    AuthUserDto,
    BusinessSummaryDto,
    ClientSummaryDto,
    ConversationMessagesResponseDto,
    ConversationSummaryDto,
    PlatformRoleDto,
} from "../../contracts";


export const prisma = new PrismaClient();

export class SqlManager implements IDatabaseClient {
    private prisma: PrismaClient;
    private logger: ILogger;
    readonly leadRepository: ILeadRepository;

    constructor(loggerInstance: ILogger = logger.child({ component: "SqlManager" })) {
        this.prisma = prisma;
        this.logger = loggerInstance;
        this.leadRepository = new LeadRepository(this.prisma);
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
            channel: CommunicationChannel.Whatsapp,
            provider: MessageProvider.Twilio,
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
                businessId: businessId
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

        if (!nameParam) {
            paramList.push({
                paramName: CLIENT_NAME_PARAM,
                paramValue: savedClientName,
                businessId
            });
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

            await tx.message.create({
                data: {
                    conversationId,
                    messageIndex: (currentMax._max.messageIndex || 0) + 1,
                    type,
                    content,
                    status: "received",
                    externalId: crypto.randomUUID()
                }
            });
        });
        
       
    }

    async createDbConversation(clientId: number, businessId: number,content: string): Promise<ConversationCacheState> {
        const conversation = await this.prisma.conversation.create({
            data: {
                clientId: clientId,
                businessId: businessId,
                conclusion:  content,
                conversationStatus: "start",
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
            businessId: business.id
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
                                paramName: param.paramName
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
                role: businessUser.role
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
                role: businessUser.role
            }))
        };
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

function getConversationActivityTime(conversation: { createdAt: Date; messages: { createdAt: Date }[] }): Date {
    return conversation.messages[0]?.createdAt || conversation.createdAt;
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
