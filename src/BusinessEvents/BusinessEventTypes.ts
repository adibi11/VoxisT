import { PrismaClient } from "@prisma/client/extension";
import {
  BusinessActivityAggregateType,
  BusinessActivityEventType,
} from "../generated/prisma/client";

export type BusinessActivityEventDto = {
  id: number;
  businessId: number;
  aggregateType: BusinessActivityAggregateType;
  aggregateId: number;
  eventType: BusinessActivityEventType;
  actorUserId: number | null;
  metadata: unknown | null;
  dueAt: Date;
  attempts: number;
};

export type NotificationDispatchDto = {
  title: string;
  body?: string;
  recipients: number[];
  payload: Record<string, unknown>;
};

export type NotificationStrategy = {
  execute(
    event: BusinessActivityEventDto,
    prisma:PrismaClient
  ): Promise<NotificationDispatchDto>;
};

export type NotificationStrategyFactory = {
  resolve(
    eventType: BusinessActivityEventType,
  ): NotificationStrategy;
};

export type NotificationSender = {
  send(
    notification: NotificationDispatchDto,
  ): Promise<void>;
};