import express from "express";
import {
  DeactivateTaskScheduleRequestDto,
  ActivateTaskScheduleRequestDto,
  CreateTaskCommentRequestDto,
  CreateTaskRequestDto,
  UpdateTaskRequestDto
} from "../../contracts";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess } from "../authMiddleware";

export function getTaskRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger, taskRateLimiter: express.RequestHandler) {
  app.post("/tasks", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); 
    if (!context) 
      return;
    const key = req.header("Idempotency-Key")?.trim();
    if (!key) 
      return res.status(400).json({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key is required" });
    try { return res.status(201).json(await sql.taskRepository.createTask(context.businessId, context.userId, req.body as CreateTaskRequestDto)); }
    catch (error) { return taskError(res, logger, "task.create.failed", error); }
  });

  app.get("/tasks", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); 
    if (!context) 
      return;
    try { 
      return res.status(200).json(await sql.taskRepository.getTasksByBusiness(context.businessId, context.userId)); 
    }

    catch (error) { 
      return taskError(res, logger, "task.list.failed", error); 

    }
  });

  app.get("/tasks/:id", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); 
    const taskId = id(req.params.id); 
    if (!context || !taskId) 
      return invalidId(res);
    try { 
      const task = await sql.taskRepository.getTaskById(context.businessId, taskId, context.userId); 
      return task ? res.status(200).json(task) : res.status(404).json({ code: "NOT_FOUND", message: "Task not found" }); }
    catch (error) { 
      return taskError(res, logger, "task.fetch.failed", error); 
    }
  });

  app.patch("/tasks/:id", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); 
    const taskId = id(req.params.id); 
    const request = req.body as UpdateTaskRequestDto; 
    if (!context || !taskId) return invalidId(res);
    if (!versionMatches(req, request.expectedVersion)) 
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "expectedVersion and If-Match must agree" });
    return sendMutation(res, await sql.taskRepository.updateTask(context.businessId, taskId, context.userId, request));
  });

  app.post("/tasks/:id/complete", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); 
    const taskId = id(req.params.id); 
    const expectedVersion = Number(req.body?.expectedVersion); 
    if (!context || !taskId) 
      return invalidId(res);
    return sendMutation(res, await sql.taskRepository.completeTask(context.businessId, taskId, context.userId, expectedVersion));
  });

  app.post("/tasks/:id/cancel", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); 
    const taskId = id(req.params.id); 
    const expectedVersion = Number(req.body?.expectedVersion); 
    if (!context || !taskId) return invalidId(res);
    return sendMutation(res, await sql.taskRepository.cancelTask(context.businessId, taskId, context.userId, expectedVersion, req.body?.cancellationReason));
  });

  app.delete("/tasks/:id", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); const taskId = id(req.params.id); const expectedVersion = Number(req.body?.expectedVersion); if (!context || !taskId) return invalidId(res);
    const result = await sql.taskRepository.deleteTask(context.businessId, taskId, context.userId, expectedVersion);
    if (result.outcome === "updated") return res.status(204).send();
    return sendMutation(res, result);
  });

  app.put("/tasks/:id/schedule", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); const taskId = id(req.params.id); const request = req.body as ActivateTaskScheduleRequestDto;
    if (!context || !taskId) return invalidId(res);
    if (!versionMatches(req, request.expectedVersion)) return res.status(400).json({ code: "VALIDATION_ERROR", message: "expectedVersion and If-Match must agree" });
    try { return sendMutation(res, await sql.taskRepository.activateTaskSchedule(context.businessId, taskId, context.userId, request)); }
    catch (error) { return taskError(res, logger, "task.schedule.activate.failed", error); }
  });

  app.get("/tasks/:id/schedule", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); const taskId = id(req.params.id);
    if (!context || !taskId) return invalidId(res);
    try {
      const schedule = await sql.taskRepository.getActiveTaskSchedule(context.businessId, taskId);
      return schedule ? res.status(200).json(schedule) : res.status(404).json({ code: "NOT_FOUND", message: "Active task schedule not found" });
    } catch (error) { return taskError(res, logger, "task.schedule.fetch.failed", error); }
  });

  app.delete("/tasks/:id/schedule", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); const taskId = id(req.params.id); const request = req.body as DeactivateTaskScheduleRequestDto;
    if (!context || !taskId) return invalidId(res);
    if (!versionMatches(req, request.expectedVersion)) return res.status(400).json({ code: "VALIDATION_ERROR", message: "expectedVersion and If-Match must agree" });
    try { return sendMutation(res, await sql.taskRepository.deactivateTaskSchedule(context.businessId, taskId, context.userId, request)); }
    catch (error) { return taskError(res, logger, "task.schedule.deactivate.failed", error); }
  });

  app.post("/tasks/:id/comments", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); 
    const taskId = id(req.params.id); 
    if (!context || !taskId) 
      return invalidId(res);
    try { return res.status(201).json(await sql.taskRepository.createComment(context.businessId, taskId, context.userId, req.body as CreateTaskCommentRequestDto)); }
    catch (error) { return taskError(res, logger, "task.comment.create.failed", error); }
  });

  app.get("/tasks/:id/comments", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res);
    const taskId = id(req.params.id);
    if (!context || !taskId) return invalidId(res);

    try {
      const comments = await sql.taskRepository.getComments(context.businessId, taskId);
      return comments
        ? res.status(200).json(comments)
        : res.status(404).json({ code: "NOT_FOUND", message: "Task not found" });
    } catch (error) {
      return taskError(res, logger, "task.comment.list.failed", error);
    }
  });

  app.patch("/tasks/:id/comments/:commentId", taskRateLimiter, requireAuth, async (req, res) => {
    const context = businessContext(req, res); 
    const taskId = id(req.params.id); 
    const commentId = id(req.params.commentId); 
    if (!context || !taskId || !commentId) 
      return invalidId(res);
    try { const comment = await sql.taskRepository.updateComment(context.businessId, taskId, commentId, context.userId, req.body as CreateTaskCommentRequestDto); return comment ? res.status(200).json(comment) : res.status(404).json({ code: "NOT_FOUND", message: "Comment not found" }); }
    catch (error) { return taskError(res, logger, "task.comment.update.failed", error); }
  });



function businessContext(req: express.Request, res: express.Response): { businessId: number; userId: number } | null {
  const authReq = req as AuthenticatedRequest; 
  const businessId = Number(req.header("X-Business-Id"));
  if (!Number.isInteger(businessId) || businessId <= 0) { res.status(400).json({ code: "VALIDATION_ERROR", message: "X-Business-Id is required" }); return null; }
  if (!requireBusinessAccess(authReq, res, businessId)) return null;
  return { businessId, userId: authReq.auth.userId };
}
function id(value: string | string[] | undefined): number | null 
{ 
  if (Array.isArray(value) || value === undefined) 
    return null; const parsed = Number(value); 
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function invalidId(res: express.Response) { 
  return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid resource id" }); }
function versionMatches(req: express.Request, expectedVersion: number): boolean { 
  const ifMatch = req.header("If-Match"); 
  return Number.isInteger(expectedVersion) && expectedVersion > 0 && (!ifMatch || ifMatch === `"${expectedVersion}"`); }
function sendMutation(res: express.Response, result: any) 
{ 
  if (result.outcome === "updated") 
    return res.status(200).json(result.task); 
  if (result.outcome === "conflict") 
    return res.status(412).json({ code: "VERSION_CONFLICT", message: "Task has changed", currentVersion: result.currentVersion }); 
  return res.status(404).json({ code: "NOT_FOUND", message: "Task not found" }); }
function taskError(res: express.Response, logger: ILogger, event: string, error: unknown) { logger.error(event, { error }); return res.status(400).json({ code: "VALIDATION_ERROR", message: error instanceof Error ? error.message : "Invalid task request" }); }}
