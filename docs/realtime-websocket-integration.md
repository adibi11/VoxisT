# Realtime WebSocket integration

Connect to `wss://<api-host>/v1/realtime`. Local development uses `ws://localhost:3000/v1/realtime`.

## Message lifecycle and source of truth

Every displayed message must first exist in the database. Redis and WebSockets distribute committed messages; they are not the source of truth.

For inbound client, bot, follow-up, and business-member messages, the core flow is:

```text
API or provider webhook
  -> message queue
  -> MessageService
  -> persist message in the database
  -> publish the persisted message metadata to Redis
  -> WebSocket subscriber forwards it to connected clients
```

Messages that must be delivered externally are added to the outbound queue after persistence. The database message ID is passed to both Redis and the outbound queue, so all components refer to the same message entity.

Business-member messages sent from the takeover/open-conversation API follow this flow as well. The API updates the takeover state and queues a `BusinessMemberConversationMessage`; it does not persist the message or send it directly to the outbound provider. The UI must not append the API request body to the transcript. It waits for the committed WebSocket message or obtains it from the next transcript fetch.

Redis publishing is best-effort. If Redis is temporarily unavailable, the database message remains valid and will appear on the next transcript fetch. A `message.created` event means that the message was persisted and accepted for processing; it does not by itself guarantee external provider delivery.

## Connection flow

Authenticate within five seconds of opening the socket:

```json
{ "type": "authenticate", "token": "<access-token>", "requestId": "auth-1" }
```

After receiving `authenticated`, subscribe to each open conversation:

```json
{ "type": "subscribe", "businessId": 12, "conversationId": 345, "requestId": "sub-345" }
```

The server checks the JWT's business access and verifies that the conversation belongs to that business. It confirms with a `subscribed` response.

New messages arrive in this envelope:

```json
{
  "type": "event",
  "event": {
    "eventId": "...",
    "event": "message.created",
    "version": 1,
    "occurredAt": "2026-08-02T09:00:00.000Z",
    "businessId": 12,
    "conversationId": 345,
    "message": {
      "id": 987,
      "conversationId": 345,
      "type": "user",
      "content": "Hello",
      "status": "received",
      "createdAt": "2026-08-02T09:00:00.000Z"
    }
  }
}
```

## Rendering and preventing duplicates

Treat `message.id` as the canonical UI identity. Do not use array position, content, timestamp, or `eventId` as the primary identity.

The same persisted message can be observed more than once. For example, a WebSocket event can overlap a transcript reload, or a worker retry can republish an idempotently persisted message. A retry can produce a new `eventId` while still containing the same `message.id`. Therefore, deduplicating only by `eventId` is insufficient.

Maintain the transcript as a map keyed by `message.id`, or upsert into the array by ID:

```ts
function upsertMessage(message: ConversationMessageDto) {
  setMessages((current) => {
    const byId = new Map(current.map((item) => [item.id, item]));
    byId.set(message.id, message);
    return [...byId.values()].sort(
      (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id - right.id
    );
  });
}
```

Apply the same upsert logic to both REST transcript results and WebSocket events. This handles all common races:

- The event arrives before the API response.
- The event arrives while the transcript request is in progress.
- The REST response already contains the message received over WebSocket.
- The worker republishes the same database message after a retry.
- The client reconnects and reloads messages it previously displayed.

If the UI needs immediate feedback after a business member presses Send, show a separate pending indicator. Do not place an optimistic message without a database ID into the authoritative transcript. Remove the pending indicator when the committed message arrives or when the transcript reload contains it.

Stop updates with:

```json
{ "type": "unsubscribe", "conversationId": 345, "requestId": "unsub-345" }
```

## Reconnection

Redis Pub/Sub does not replay missed events. After reconnecting:

1. Authenticate again.
2. Subscribe to the conversation and begin buffering or upserting events.
3. Reload the transcript from `GET /v1/businesses/:businessId/conversations/:conversationId/messages`.
4. Merge the REST messages and any buffered WebSocket messages by `message.id`.

Subscribing before the reload avoids a gap where a message could be committed after the REST response but before the WebSocket subscription. The database response remains authoritative; WebSocket events provide immediate UI updates between database reads.

Errors have the shape below. Codes are `INVALID_COMMAND`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, or `INTERNAL_ERROR`.

```json
{ "type": "error", "code": "FORBIDDEN", "message": "Business access denied", "requestId": "..." }
```
