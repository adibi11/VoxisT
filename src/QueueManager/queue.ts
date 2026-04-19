import { Queue } from "bullmq";
import { connection } from "../dataClients/CacheClient/redis";

export class QueueManager {
    public queue: Queue;
    constructor(queueName: string) {
        this.queue = new Queue(queueName, {
            connection
        });
    }
}