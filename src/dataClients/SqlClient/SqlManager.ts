import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { Client, ConversationEntity } from "../Types/messageTypes";
import { mapToConversationEntity } from "../Types/mappers";
import { BusinessParam } from "../Types/messageTypes";
import { BusinessDto, MessageType } from "../Types/apiTypes";
import { ConversationCacheState } from "../Types/messageTypes";
import { ISqlInterface } from "./sqlInterface";


export const prisma = new PrismaClient();

export class SqlManager implements ISqlInterface {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
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

        return {
            conversationId:  conversation.id ,
            stage: messages.length > 0 ? "collecting" : "start",
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
            console.log("Param not found");
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
}
