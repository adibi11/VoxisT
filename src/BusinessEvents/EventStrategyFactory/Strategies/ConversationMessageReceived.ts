import { PrismaClient } from "../../../generated/prisma/client";
import { NotificationStrategy } from "../../BusinessEventTypes";
import { BusinessActivityEventDto, NotificationDispatchDto } from "../../BusinessEventTypes";

// A human-managed conversation never auto-replies, so every inbound message
// on one needs to reach the agent as a push notification instead. Recipient
// is the agent who owns the takeover; falls back to all business users only
// as a defensive default (should not happen - humanManaged conversations
// always have a takenOverByUserId).
export const conversationMessageReceivedStrategy: NotificationStrategy = {
    async execute(event: BusinessActivityEventDto, prisma: PrismaClient): Promise<NotificationDispatchDto> {
        const conversation = await prisma.conversation.findUnique({
            where: {
                id: event.aggregateId
            },
            include: {
                client: true,
                business: {
                    select: {
                        users: {
                            select: {
                                userId: true
                            }
                        }
                    }
                }
            }
        });

        const recipients = conversation?.takenOverByUserId
            ? [conversation.takenOverByUserId]
            : conversation?.business.users.map((u) => u.userId) ?? [];

        return {
            title: "New message from a client",
            body: conversation?.client.phoneNumber,
            recipients,
            payload: {
                conversationId: event.aggregateId,
                clientId: conversation?.clientId
            }
        };
    }
};
