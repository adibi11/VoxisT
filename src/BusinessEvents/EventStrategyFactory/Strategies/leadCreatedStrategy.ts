import { PrismaClient } from "../../../generated/prisma/client";
import { NotificationStrategy } from "../../BusinessEventTypes";
import { BusinessActivityEventDto, NotificationDispatchDto } from "../../BusinessEventTypes";

export const leadCreatedStrategy: NotificationStrategy ={
    async execute(event: BusinessActivityEventDto, prisma: PrismaClient): Promise<NotificationDispatchDto> {
        const lead = await prisma.lead.findUnique({
            where:{
                id:event.aggregateId
            },
            select:{
                business:{
                    select:{
                        users:{
                            select:{
                                userId:true
                            }
                        }
                    }
                }
            }
        });
        return {
            recipients: lead?.business.users.map(u => u.userId)??[],
            title:"New lead incoming",
            payload:{

            }
        };
    },
}