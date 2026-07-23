# Tasks and Notifications API Contract — Phase 2

This is a contract-only phase. None of the endpoints in this document are registered yet, and device/preference delivery persistence is intentionally deferred.

## Common rules

- Base path: `/v1`.
- All task endpoints require `Authorization: Bearer <jwt>` and `X-Business-Id: <positive integer>`. The header is required because a JWT can contain memberships in multiple businesses.
- IDs are positive integers; instants are ISO-8601 UTC strings; `timezone` is a valid IANA identifier.
- Tasks, comments, reminders, and all referenced users/leads/occurrences must belong to `X-Business-Id`; otherwise respond as `404 NOT_FOUND`.
- `POST /tasks` requires an `Idempotency-Key` header. It is an opaque 1–255 character value and is scoped to user, business, method, and path.
- `PATCH /tasks/{id}`, complete, cancel, and delete require `expectedVersion` in the JSON body. `If-Match: "<version>"` is optional, but when supplied must equal `expectedVersion`.

## DTO validation

| DTO | Rules |
|---|---|
| `CreateTaskRequestDto` | `headline` 1–200 trimmed characters; `description` 1–10,000; valid priority; required member `mainAssigneeUserId`; listener ids unique and cannot include the main assignee; optional lead belongs to tenant; valid timezone; `dueAt >= startsAt` when both exist. |
| `UpdateTaskRequestDto` | At least one editable field plus `expectedVersion >= 1`; same field rules as create; `schedule: null` means deactivate the active schedule rather than erase history. |
| `TaskScheduleRequestDto` | Non-empty RFC 5545 RRULE; valid IANA zone; `endsAt >= startsAt`; non-negative due offset. RRULE interpretation occurs in its timezone. |
| `CreateTaskReminderRequestDto` | Exactly one trigger form: `triggerAt`, or `reference` plus non-negative `offsetMinutes`; `channel` is currently `PUSH`; `SPECIFIC_USERS` requires 1–100 unique tenant-member ids; other modes must omit `recipientUserIds`. An `occurrenceId`, if supplied, belongs to the task. |
| `CreateTaskCommentRequestDto` | Trimmed body, 1–10,000 characters. |
| `RegisterDeviceRequestDto` | `deviceId`, FCM token, app version, and locale are non-empty within 255, 4,096, 64, and 35 characters respectively; OS is `IOS` or `ANDROID`. |
| `UpdateNotificationPreferencesRequestDto` | Event types/channels are known enum values; no duplicates; valid IANA zone; quiet-hour values are `HH:mm` and may span midnight. |

## Error model

Every non-success response has this shape:

```json
{
  "code": "VERSION_CONFLICT",
  "message": "Task has changed since version 4.",
  "requestId": "req_...",
  "currentVersion": 5,
  "details": [{ "field": "headline", "rule": "maxLength", "message": "Must be at most 200 characters." }]
}
```

Use `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 IDEMPOTENCY_KEY_REUSED`, `409 IDEMPOTENCY_IN_PROGRESS`, `409 STATE_CONFLICT`, `412 VERSION_CONFLICT`, `429 RATE_LIMITED`, and `500 INTERNAL_ERROR`.

## Idempotency

For `POST /tasks`, normalize the request JSON using canonical key ordering, then hash it. Store: idempotency key, authenticated user id, business id, HTTP method/path, request hash, response status/body, task id, created/expiry timestamps, and an in-progress marker. Retain completed entries for 24 hours.

- First request reserves the key and completes the task write and saved response in one database transaction.
- Same scope/key/hash returns the stored status and body verbatim, including `201`.
- Same scope/key with another hash returns `409 IDEMPOTENCY_KEY_REUSED`.
- An in-progress reservation returns `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After`.
- The implementation must never reserve a key outside the task-create transaction in a way that can leave an unowned task after a crash.

## Optimistic concurrency

`expectedVersion` is compared in the same conditional update as task mutation: `WHERE id = ? AND businessId = ? AND version = ?`. A successful mutation increments `version` exactly once. Zero rows updated requires a fresh scoped read:

- task missing/deleted for this caller → `404`;
- otherwise → `412 VERSION_CONFLICT` including `currentVersion`.

The client refreshes the task and resubmits an intentional edit. No endpoint may silently overwrite a newer version.

## Endpoint status

The OpenAPI document names the intended routes. They are specified but deliberately unimplemented in Phase 2.

- `POST /tasks`, `GET /tasks`, `GET /tasks/{id}`, `PATCH /tasks/{id}`
- `POST /tasks/{id}/complete`, `POST /tasks/{id}/cancel`, `DELETE /tasks/{id}`
- `POST /tasks/{id}/comments`, `PATCH /tasks/{id}/comments/{commentId}`
- `POST /tasks/{id}/reminders`, `DELETE /tasks/{id}/reminders/{reminderId}`
- `GET /notifications`, `POST /notifications/{id}/read`
- `POST /me/devices`, `DELETE /me/devices/{deviceId}`
- `GET /me/notification-preferences`, `PATCH /me/notification-preferences`
