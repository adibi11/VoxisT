import { NotificationDispatchDto } from "../BusinessEventTypes";
import { PushDevice } from "../../generated/prisma/client";

export interface INotificationSender {
  send(
    notifications: NotificationDispatchDto[],
    devicesByUserId: Map<number, PushDevice[]>,
  ): Promise<void>;
}