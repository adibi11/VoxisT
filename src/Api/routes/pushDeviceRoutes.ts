import { PushDeviceDto } from "../../dataClients/Types/apiTypes"; 
import express from "express";
import { RequestHandler } from "express";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";
import { requireAuth } from "../authMiddleware";



export function getPushDeviceRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger)
{

    app.post("/mobile/push-devices",requireAuth, async (req,res)=>
    {
        try{
            const pushRequest: PushDeviceDto = req.body;
            
            await sql.pushDeviceRepository.upsertDeviceExpoToken(pushRequest);
            logger.info("push.notification.succeeded");
            return res.status(200).json({
                message:"success"
            })
        }
        catch(error){
            return res.status(400).json({
                message:"Error in push device request",
                errorMessage : error
            });
        }
    });


    app.post("/mobile/disable-push-device",async (req,res)=>{
        try{
            const pushRequest: PushDeviceDto = req.body;
            await sql.pushDeviceRepository.disablePushDevice(pushRequest);
            logger.info("disabled.notifications");
            return res.status(200).json({
                message:"success"
            });
        }
        catch(error){
            return res.status(400).json({
                message:"Error in push device request",
                errorMessage : error
            });
        }
    });

    app.post("/mobile/enable-push-device",async (req,res)=>{
        try{
            const pushRequest: PushDeviceDto = req.body;
            await sql.pushDeviceRepository.enablePushDevice(pushRequest);
            logger.info("enabled.notifications");
            return res.status(200).json({
                message:"success"
            });
        }
        catch(error){
            return res.status(400).json({
                message:"Error in push device request",
                errorMessage : error
            });
        }
    });

    
}









