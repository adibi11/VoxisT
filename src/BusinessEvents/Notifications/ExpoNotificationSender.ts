import { INotificationSender } from "./INotificationSender";
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { PushDevice } from "../../generated/prisma/client";
import { NotificationDispatchDto } from "../BusinessEventTypes";




export class ExpoNotificationSender implements INotificationSender {

    private readonly expo = new Expo();

    async send(
        notifications: NotificationDispatchDto[],
        devicesByUserId: Map<number, PushDevice[]>,
    ): Promise<void> {
        const expo:Expo = new Expo();
        // build Expo messages
        const expoPushMessages : ExpoPushMessage[] = [];
        for (const notification of notifications) {

            for (const appUserId of notification.recipients) {

                const devices =
                    devicesByUserId.get(appUserId);

                if (!devices) {
                    continue;
                }

                for (const device of devices) {

                    expoPushMessages.push({
                        to: device.expoPushToken,
                        title: notification.title,
                        body: notification.body,
                        data: notification.payload,
                    });

                }
            }
        }
        expo.sendPushNotificationsAsync(expoPushMessages);
    }
}