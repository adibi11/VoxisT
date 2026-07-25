import { PrismaClient } from "../../../generated/prisma/client";
import { NotificationStrategy } from "../../BusinessEventTypes";
import { BusinessActivityEventDto, NotificationDispatchDto } from "../../BusinessEventTypes";





export const cancelStrategy:NotificationStrategy = {

    async execute(event: BusinessActivityEventDto, prisma: PrismaClient): Promise<NotificationDispatchDto> {
        const participants = await prisma.businessActivityEvent.update({
            where: {
                id : event.id
            },
            data:{
                state: "CANCELLED"
            }
        });
        return {
            title:"cancelled",
            payload:{

            },
            recipients:[]
        };
    },

}