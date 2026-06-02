import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { Client, ConversationEntity } from "../Types/messageTypes";
import { mapToConversationEntity } from "../Types/mappers";
import { BusinessParam } from "../Types/messageTypes";
import { BusinessDto, MessageType } from "../Types/apiTypes";
import { CommunicationChannel, MessageProvider } from "../Types/apiTypes";
import { ConversationCacheState } from "../Types/messageTypes";
import { ISqlInterface } from "./sqlInterface";
import { ConversationState } from "../Types/stateMachineTypes";
import { ILogger, logger } from "../../logging/logger";
import { AuthUserDto, BusinessSummaryDto, ClientSummaryDto, ConversationMessagesResponseDto, ConversationSummaryDto } from "../../contracts";


export const prisma = new PrismaClient();

export class SqlManager implements ISqlInterface {
    private prisma: PrismaClient;
    private logger: ILogger;

    constructor(loggerInstance: ILogger = logger.child({ component: "SqlManager" })) {
        this.prisma = prisma;
        this.logger = loggerInstance;
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
        const conversation = await this.prisma.conversation.findFirst({
            where: {
                clientId: clientId,
                businessId: businessId
            }
        });
        if (!conversation) {
            return null;
        }
        const messages = await this.prisma.message.findMany({
            where: {
                conversationId: conversation ? conversation.id : undefined
            }
        });
        const paramList: BusinessParam[] = await this.getBusinessParams(businessId, clientId, conversation ? conversation.id : undefined);
        const client = await this.prisma.client.findUnique({
            where: {
                id: clientId
            }
        });
        if (!client) {
            return null;
        }
        return {
            conversationId:  conversation.id ,
            state: messages.length > 0 ? ConversationState.collecting : ConversationState.start,
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
            updatedAt: new Date()
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
        return paramList;
    }

    async createMessage(conversationId: number,type: "user"| "bot",content: string): Promise<void> {
    await this.prisma.message.create({
        data: {
        conversationId,
        type,
        content,
        status: "received", // או processing
        externalId: crypto.randomUUID() 
        }
    });
    }

    async createDbConversation(clientId: number, businessId: number,content: string): Promise<void> {
        await this.prisma.conversation.create({
            data: {
                clientId: clientId,
                businessId: businessId,
                conclusion: "First message: " + content,
                conversationStatus: "start",
            },
        });
        
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
            name: "Unknown",
            phone: client.phoneNumber,
            email: ""
        };
        return mappedClient;
    }
    async upsertParamAnswer(
        clientId: number,
        conversationId: number,
        businessId: number,
        paramName: string,
        paramValue: string
        ): Promise<void> {

        const param = await this.prisma.businessParameter.findFirst({
            where: {
            businessId,
            paramName
            }
        });

        if (!param) {
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

    async createBusinessUser(email: string, passwordHash: string, displayName: string | undefined, businessId: number): Promise<AuthUserDto> {
        // Users are connected to businesses through BusinessUser so we can support multi-business access later.
        const user = await this.prisma.appUser.create({
            data: {
                email: email.toLowerCase(),
                passwordHash,
                displayName,
                businesses: {
                    create: {
                        businessId,
                        role: "owner"
                    }
                }
            },
            include: {
                businesses: true
            }
        });

        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            businessIds: user.businesses.map((businessUser) => businessUser.businessId)
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
            businessIds: user.businesses.map((businessUser) => businessUser.businessId)
        };
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
                    orderBy: { createdAt: "desc" },
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
                    orderBy: { createdAt: "asc" }
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
}
