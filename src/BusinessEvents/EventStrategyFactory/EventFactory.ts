import {
  BusinessActivityAggregateType,
  BusinessActivityEventType,
  PrismaClient
} from "../../generated/prisma/client";
import { NotificationStrategy } from "../BusinessEventTypes";
import { taskCreatedStrategy } from "./Strategies/TaskCreated";
import { taskCompletedStrategy } from "./Strategies/TaskCompleted";
import { cancelStrategy } from "./Strategies/cancelStrategy";
import { leadCreatedStrategy } from "./Strategies/leadCreatedStrategy";

export const notificationStrategyFactory = {
    resolve(eventType: BusinessActivityEventType): NotificationStrategy {
        switch(eventType){
            case "TASK_CREATED":
                return taskCreatedStrategy;
            case "TASK_COMPLETED":
                return taskCompletedStrategy;
            case "LEAD_CREATED":
                return leadCreatedStrategy;
            case "TASK_CANCELLED":
            case "TASK_DELETED":
            case "ASSIGNEE_CHANGED":
            case "LISTENER_ADDED":
            case "LISTENER_REMOVED":
            case "COMMENT_CREATED":
            case "COMMENT_EDITED":
            case "COMMENT_DELETED":
            case "SCHEDULE_CREATED":
            case "SCHEDULE_UPDATED":
            case "SCHEDULE_DEACTIVATED":
            case "OCCURRENCE_CREATED":
            case "OCCURRENCE_COMPLETED":
            case "OCCURRENCE_CANCELLED":
            case "REMINDER_CREATED":
            case "REMINDER_CANCELLED":
            case "TASK_REMINDER_DUE":
            case "TIME_ENTRY_CREATED":
            case "TIME_ENTRY_UPDATED":
            case "TIME_ENTRY_DELETED":
            default:
                return cancelStrategy;
        }
    }
}
