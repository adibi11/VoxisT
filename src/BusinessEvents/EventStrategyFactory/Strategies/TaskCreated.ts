import { PrismaClient } from "../../../generated/prisma/client";
import { NotificationStrategy } from "../../BusinessEventTypes";
import { BusinessActivityEventDto, NotificationDispatchDto } from "../../BusinessEventTypes";





export const taskCreatedStrategy:NotificationStrategy = {

    async execute(event: BusinessActivityEventDto, prisma: PrismaClient): Promise<NotificationDispatchDto> {
        const participants = await prisma.taskParticipant.findMany({
            where: {
                taskId: event.aggregateId,
            },
        });
        const task = await prisma.task.findUnique({
            where:{
                id: event.aggregateId
            }
        });

        return {
            title: "A task has been created",
            recipients: participants.map(p=> p.id),
            payload:{
                taskDetails: task,

            }
        };
    },

}
