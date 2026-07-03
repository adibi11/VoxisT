# UI Lead & Client Contract

This document is a handoff contract for the UI repo. It describes the current API surface for clients, conversations, and leads.

## API Assumptions

- Base API URL: environment-dependent, typically `http://localhost:3000`.
- All routes below require `Authorization: Bearer <token>`.
- All business-scoped routes require the authenticated user to have access to `businessId`.
- Date/time fields are ISO strings.
- Lead APIs are implemented through `sql.leadRepository`.

## Lead Types

```ts
export type LeadStatusDto =
  | "NEW"
  | "QUALIFYING"
  | "QUALIFIED"
  | "ASSIGNED"
  | "FOLLOW_UP"
  | "WON"
  | "LOST"
  | "CLOSED";

export type LeadSourceDto =
  | "WHATSAPP"
  | "MANUAL"
  | "FACEBOOK"
  | "GOOGLE_ADS"
  | "WEBSITE"
  | "OTHER";

export type LeadSummaryDto = {
  id: number;
  businessId: number;
  clientId?: number | null;
  memberId?: number | null;
  status: LeadStatusDto;
  source: LeadSourceDto;
  score?: number | null;
  summary?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string | null;
  followUpAt?: string | null;
  closedAt?: string | null;
};

export type LeadDto = LeadSummaryDto & {
  notes?: string | null;
};

export type CreateManualLeadRequestDto = {
  clientId?: number;
  name?: string;
  phoneNumber?: string;
  memberId?: number;
  status?: LeadStatusDto;
  source?: LeadSourceDto;
  score?: number;
  summary?: string;
  notes?: string;
  followUpAt?: string | null;
};

export type UpdateLeadRequestDto = {
  memberId?: number | null;
  status?: LeadStatusDto;
  score?: number | null;
  summary?: string | null;
  notes?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  followUpAt?: string | null;
};
```

## Client & Conversation Types

```ts
export type ClientSummaryDto = {
  id: number;
  phoneNumber: string;
  conversationCount: number;
  lastConversationAt?: string;
};

export type ConversationSummaryDto = {
  id: number;
  businessId: number;
  clientId: number;
  status: string;
  conclusion?: string | null;
  createdAt: string;
  messageCount: number;
  lastMessageAt?: string;
};

export type ConversationMessageDto = {
  id: number;
  conversationId: number;
  type: "user" | "bot" | "system";
  content: string;
  status: string;
  createdAt: string;
};

export type ConversationParamAnswerDto = {
  id: number;
  paramName: string;
  paramValue: string;
  createdAt: string;
};

export type ConversationMessagesResponseDto = {
  conversation: ConversationSummaryDto;
  messages: ConversationMessageDto[];
  params: ConversationParamAnswerDto[];
};
```

## Lead Endpoints

### List Leads

```http
GET /businesses/:businessId/leads
```

Response:

```ts
LeadSummaryDto[]
```

Use for the lead list / pipeline screen.

### Get Lead

```http
GET /businesses/:businessId/leads/:leadId
```

Response:

```ts
LeadDto
```

Errors:

- `404` when lead does not exist under that business.

### Create Manual Lead

```http
POST /businesses/:businessId/leads
```

Body:

```ts
CreateManualLeadRequestDto
```

Validation:

- Must include at least one of `clientId`, `name`, or `phoneNumber`.
- If `clientId` is provided, the API creates a lead from the existing client.
- If `phoneNumber` is provided, the repository may reuse or create a client.
- Defaults are handled by API/repository:
  - `status`: `"NEW"`
  - `source`: `"MANUAL"`

Example:

```json
{
  "name": "David Cohen",
  "phoneNumber": "+972501234567",
  "source": "MANUAL",
  "summary": "Uploaded manually from business dashboard",
  "notes": "Interested in a consultation next week",
  "followUpAt": "2026-07-10T09:00:00.000Z"
}
```

Create from existing client:

```json
{
  "clientId": 123,
  "source": "MANUAL",
  "status": "NEW"
}
```

Response:

```ts
LeadDto
```

### Update Lead

```http
PATCH /businesses/:businessId/leads/:leadId
```

Body:

```ts
UpdateLeadRequestDto
```

Use for:

- status changes
- assignment changes
- score updates
- notes/summary edits
- follow-up scheduling
- contact field correction

Example:

```json
{
  "status": "FOLLOW_UP",
  "score": 80,
  "notes": "Asked to call back after Sunday",
  "followUpAt": "2026-07-12T11:00:00.000Z"
}
```

Response:

```ts
LeadDto
```

### Delete Lead

```http
DELETE /businesses/:businessId/leads/:leadId
```

Response:

```http
204 No Content
```

Use carefully. In the UI this should probably be a secondary/destructive action.

## Client Endpoints

### List Clients

```http
GET /businesses/:businessId/clients
```

Response:

```ts
ClientSummaryDto[]
```

Use for:

- client list screen
- manual lead creation from an existing client
- client selector/autocomplete

Current client summary does not include `name`. Leads do include `name`/`phoneNumber`.

## Conversation Endpoints

### List Conversations

```http
GET /businesses/:businessId/conversations
GET /businesses/:businessId/conversations?clientId=:clientId
```

Response:

```ts
ConversationSummaryDto[]
```

Use for:

- business-wide conversation list
- client detail conversation history

### Get Conversation Messages

```http
GET /businesses/:businessId/conversations/:conversationId/messages
```

Response:

```ts
ConversationMessagesResponseDto
```

Use for:

- conversation transcript view
- showing collected parameter answers near the transcript

## Suggested UI Entries

### Leads Page

Route suggestion:

```txt
/businesses/:businessId/leads
```

Core UI:

- lead table/list
- status filter
- source filter
- search by name or phone
- quick status update
- open lead detail
- create manual lead button

Important fields to show:

- `name` fallback to `phoneNumber`
- `status`
- `source`
- `score`
- `followUpAt`
- `assignedAt`
- `createdAt`

### Lead Detail Page

Route suggestion:

```txt
/businesses/:businessId/leads/:leadId
```

Core UI:

- lead profile header
- status selector
- score input
- assigned member selector when members API exists
- notes editor
- follow-up date/time control
- linked client id if present
- link to client conversations if `clientId` exists

### Manual Lead Modal

Inputs:

- existing client selector OR manual name/phone fields
- source
- status
- summary
- notes
- follow-up date
- score

Validation:

- require one of `clientId`, `name`, or `phoneNumber`
- prefer `phoneNumber` for new manual leads so the backend can link/create a client

### Client Detail / Client List

Add action:

```txt
Create lead from client
```

Payload:

```json
{
  "clientId": 123,
  "source": "MANUAL",
  "status": "NEW"
}
```

## Implementation Notes For UI

- Treat `LeadStatusDto` as a controlled enum.
- Treat `LeadSourceDto` as a controlled enum.
- Use `PATCH` for partial lead edits.
- Optimistically updating lead status is possible, but refresh the lead row/detail after the API response.
- `assignedAt` is public API naming. Backend maps this from the current schema field `asignTime`.
- The API currently returns generic `500` for repository errors; UI should show a friendly failure toast.

## Open Follow-Ups

- Add dedicated route/client method name for "create lead from client" only if the current `POST /leads` with `clientId` feels too implicit.
- Add server-side list filters when lead volume grows.
- Add `name` to `ClientSummaryDto` if the client list needs display names.
- Add member/user listing endpoint before building assignment dropdowns.
- Decide whether delete should remain hard-delete or become a status change such as `CLOSED` or `LOST`.
