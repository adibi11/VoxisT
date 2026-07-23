import {
  ActivateTaskScheduleRequestDto,
  DeactivateTaskScheduleRequestDto,
  CreateTaskCommentRequestDto,
  CreateTaskRequestDto,
  TaskCommentResponseDto,
  TaskScheduleDto,
  TaskResponseDto,
  UpdateTaskRequestDto
} from "../../../../contracts";

export type TaskMutationResult =
  | { outcome: "updated"; task: TaskResponseDto }
  | { outcome: "not_found" }
  | { outcome: "conflict"; currentVersion: number };

export interface ITaskRepository {
  createTask(businessId: number, actorUserId: number, request: CreateTaskRequestDto): Promise<TaskResponseDto>;
  getTaskById(businessId: number, taskId: number, viewerUserId: number): Promise<TaskResponseDto | null>;
  getTasksByBusiness(businessId: number, viewerUserId: number): Promise<TaskResponseDto[]>;
  updateTask(businessId: number, taskId: number, actorUserId: number, request: UpdateTaskRequestDto): Promise<TaskMutationResult>;
  completeTask(businessId: number, taskId: number, actorUserId: number, expectedVersion: number): Promise<TaskMutationResult>;
  cancelTask(businessId: number, taskId: number, actorUserId: number, expectedVersion: number, cancellationReason?: string): Promise<TaskMutationResult>;
  deleteTask(businessId: number, taskId: number, actorUserId: number, expectedVersion: number): Promise<TaskMutationResult>;
  getActiveTaskSchedule(businessId: number, taskId: number): Promise<TaskScheduleDto | null>;
  activateTaskSchedule(businessId: number, taskId: number, actorUserId: number, request: ActivateTaskScheduleRequestDto): Promise<TaskMutationResult>;
  deactivateTaskSchedule(businessId: number, taskId: number, actorUserId: number, request: DeactivateTaskScheduleRequestDto): Promise<TaskMutationResult>;
  getComments(businessId: number, taskId: number): Promise<TaskCommentResponseDto[] | null>;
  createComment(businessId: number, taskId: number, actorUserId: number, request: CreateTaskCommentRequestDto): Promise<TaskCommentResponseDto>;
  updateComment(businessId: number, taskId: number, commentId: number, actorUserId: number, request: CreateTaskCommentRequestDto): Promise<TaskCommentResponseDto | null>;
  deleteComment(businessId: number, taskId: number, commentId: number, actorUserId: number): Promise<boolean>;

}
