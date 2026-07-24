import { PushDeviceDto } from "../../../Types/apiTypes";



export interface IPushDeviceRepository{
    upsertDeviceExpoToken(device:PushDeviceDto):Promise<void>;
    revokeDeviceExpoToken(device:PushDeviceDto):Promise<void>;
    disablePushDevice(device:PushDeviceDto):Promise<void>;
    enablePushDevice(device:PushDeviceDto):Promise<void>;
}