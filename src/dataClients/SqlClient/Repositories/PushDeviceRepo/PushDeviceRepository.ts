import { IPushDeviceRepository } from "./IPushDeviceRepository";
import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { PushDeviceDto } from "../../../Types/apiTypes";
import { DateTime } from "rrule/dist/esm/datetime";


export class PushDeviceRepository implements IPushDeviceRepository
{
    private readonly prisma:PrismaClient;
    constructor(sqlClient:PrismaClient)
    {
        this.prisma = sqlClient;
    }

    async upsertDeviceExpoToken(device: PushDeviceDto): Promise<void> {

        await this.prisma.pushDevice.upsert({
            where:{
                    appUserId_deviceId:{
                appUserId: device.appUserId,
                deviceId: device.deviceId} 
            },
            update:{
                expoPushToken: device.expoPushToken,
                lastSeenAt: new Date()
            },
            create:{
                appUserId: device.appUserId,
                deviceId: device.deviceId,
                lastSeenAt: new Date(),
                expoPushToken: device.expoPushToken,
                platform: "UNKNOWN",
                isActive: true,
                appVersion:""


            }});

    }

    async revokeDeviceExpoToken(device:PushDeviceDto): Promise<void> {
        
        await this.prisma.pushDevice.delete({
            where:{
                appUserId_deviceId:
                {
                    appUserId: device.appUserId,
                    deviceId: device.deviceId
                }
            }
        })
    }

    async disablePushDevice(device: PushDeviceDto): Promise<void> {
        await this.prisma.pushDevice.update({
            where:{
                appUserId_deviceId:{
                    appUserId: device.appUserId,
                    deviceId: device.deviceId
                }
            },
            data:
            {
                isActive: false
            }
        });
    }
    async enablePushDevice(device:PushDeviceDto)
    {
        await this.prisma.pushDevice.update({
            where:{
                appUserId_deviceId:{
                    appUserId: device.appUserId,
                    deviceId: device.deviceId
                }
            },
            data:
            {
                isActive: true
            }
        });
    }

}