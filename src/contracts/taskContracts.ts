// Phase 2 API contracts only. No route, repository, or notification implementation depends on these yet.

export type TaskStatusDto = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DELETED";
export type TaskPriorityDto = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type TaskParticipantRoleDto = "MAIN_ASSIGNEE" | "LISTENER";
export type NotificationChannelDto = "PUSH";
export type NotificationEventTypeDto =
  | "TASK_ASSIGNED"
  | "TASK_REMINDER"
  | "TASK_COMMENT"
  | "TASK_COMPLETED"
  | "TASK_CANCELLED";

export type TaskScheduleRequestDto = {
  rrule: string;
  timezone: string;
  startsAt?: string | null;
  endsAt?: string | null;
  occurrenceDueOffsetMinutes?: number | null;
};

export type ActivateTaskScheduleRequestDto = TaskScheduleRequestDto & {
  expectedVersion: number;
  nextOccurrenceAt: string;
};

export type DeactivateTaskScheduleRequestDto = {
  expectedVersion: number;
};

export type CreateTaskRequestDto = {
  headline: string;
  description: string;
  priority?: TaskPriorityDto;
  category?: string | null;
  mainAssigneeUserId: number;
  listenerUserIds?: number[];
  leadId?: number | null;
  startsAt?: string | null;
  dueAt?: string | null;
  isAllDay?: boolean;
  timezone: string;
  schedule?: TaskScheduleRequestDto | null;
};

export type UpdateTaskRequestDto = {
  expectedVersion: number;
  headline?: string;
  description?: string;
  priority?: TaskPriorityDto;
  category?: string | null;
  leadId?: number | null;
  startsAt?: string | null;
  dueAt?: string | null;
  isAllDay?: boolean;
  timezone?: string;
  mainAssigneeUserId?: number;
  listenerUserIds?: number[];
  schedule?: TaskScheduleRequestDto | null;
};

export type TaskUserSummaryDto = {
  id: number;
  displayName: string | null;
  email: string;
};

export type TaskParticipantDto = {
  user: TaskUserSummaryDto;
  role: TaskParticipantRoleDto;
  addedAt: string;
};

export type TaskLeadReferenceDto = {
  id: number;
  name: string | null;
  status: string;
};

export type TaskScheduleDto = {
  id: number;
  rrule: string;
  timezone: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  nextOccurrenceAt: string | null;
  occurrenceDueOffsetMinutes: number | null;
};

export type TaskPermissionsDto = {
  canView: boolean;
  canEdit: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canDelete: boolean;
  canComment: boolean;
  canManageReminders: boolean;
};

export type TaskResponseDto = {
  id: number;
  businessId: number;
  headline: string;
  description: string;
  status: TaskStatusDto;
  priority: TaskPriorityDto;
  category: string | null;
  lead: TaskLeadReferenceDto | null;
  startsAt: string | null;
  dueAt: string | null;
  isAllDay: boolean;
  timezone: string;
  mainAssignee: TaskParticipantDto;
  listeners: TaskParticipantDto[];
  schedule: TaskScheduleDto | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  deletedAt: string | null;
  permissions: TaskPermissionsDto;
};

export type CreateTaskCommentRequestDto = { body: string };

export type TaskCommentResponseDto = {
  id: number;
  taskId: number;
  body: string;
  author: TaskUserSummaryDto;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  isDeleted: boolean;
};

export type UpdateNotificationPreferencesRequestDto = {
  enabledEventTypes: NotificationEventTypeDto[];
  channels: NotificationChannelDto[];
  quietHours?: { startLocalTime: string; endLocalTime: string } | null;
  timezone: string;
};

export type RegisterDeviceRequestDto = {
  deviceId: string;
  operatingSystem: "IOS" | "ANDROID";
  fcmToken: string;
  appVersion: string;
  locale: string;
};

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "VERSION_CONFLICT"
  | "STATE_CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ApiErrorResponseDto = {
  code: ApiErrorCode;
  message: string;
  requestId?: string;
  details?: Array<{ field?: string; rule: string; message: string }>;
  currentVersion?: number;
};
