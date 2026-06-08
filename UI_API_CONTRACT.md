# VoxisT UI API Contract

This document is the source of truth for the React UI. Build UI API clients and screens according to these DTOs and endpoints.

## Base Rules

- API base URL in local development: `http://localhost:3000` (use it as an envirnment variable)
- JSON endpoints use `Content-Type: application/json`
- Protected endpoints require:

```http
Authorization: Bearer <jwt>
```

- Date/time fields are ISO strings.
- IDs are numbers.

## Auth DTOs

### `LoginRequestDto`

```ts
type LoginRequestDto = {
  email: string;
  password: string;
};
```

### `RegisterBusinessUserRequestDto`

Bootstrap endpoint for creating both a business and its first owner user.

```ts
type RegisterBusinessRequestDto = {
  name: string;
  phone: string;
  email: string;
  parameters: {
    paramName: string;
    paramValue?: string;
  }[];
  starterMessage: string;
  endMessage: string;
  escalationMessage: string;
  language?: string;
};

type RegisterBusinessUserRequestDto = {
  email: string;
  password: string;
  displayName?: string;
  business: RegisterBusinessRequestDto;
};
```

### `AuthUserDto`

```ts
type AuthUserDto = {
  id: number;
  email: string;
  displayName?: string | null;
  businessIds: number[];
};
```

### `AuthResponseDto`

```ts
type AuthResponseDto = {
  token: string;
  user: AuthUserDto;
};
```

## Business DTOs

### `BusinessSummaryDto`

```ts
type BusinessSummaryDto = {
  id: number;
  name: string;
  phone: string;
  email: string;
};
```

## Client DTOs

### `ClientSummaryDto`

```ts
type ClientSummaryDto = {
  id: number;
  phoneNumber: string;
  conversationCount: number;
  lastConversationAt?: string;
};
```

## Conversation DTOs

### `ConversationSummaryDto`

```ts
type ConversationSummaryDto = {
  id: number;
  businessId: number;
  clientId: number;
  status: string;
  conclusion?: string | null;
  createdAt: string;
  messageCount: number;
  lastMessageAt?: string;
};
```

### `ConversationMessageDto`

```ts
type ConversationMessageDto = {
  id: number;
  conversationId: number;
  type: "user" | "bot" | "system";
  content: string;
  status: string;
  createdAt: string;
};
```

### `ConversationParamAnswerDto`

```ts
type ConversationParamAnswerDto = {
  id: number;
  paramName: string;
  paramValue: string;
  createdAt: string;
};
```

### `ConversationMessagesResponseDto`

```ts
type ConversationMessagesResponseDto = {
  conversation: ConversationSummaryDto;
  messages: ConversationMessageDto[];
  params: ConversationParamAnswerDto[];
};
```

## Endpoints

### Register Business And Owner User

Creates a new business, creates its first owner user, links them, and returns a JWT scoped to the new business id.

```http
POST /auth/register
```

Request:

```ts
RegisterBusinessUserRequestDto
```

Example:

```json
{
  "email": "owner@example.com",
  "password": "change-me",
  "displayName": "Owner",
  "business": {
    "name": "Example Cleaning",
    "phone": "whatsapp:+15559999999",
    "email": "owner@example.com",
    "parameters": [
      { "paramName": "name" },
      { "paramName": "budget" },
      { "paramName": "city" }
    ],
    "starterMessage": "Hi! How can I help you today?",
    "endMessage": "Thanks, we have everything we need.",
    "escalationMessage": "I am escalating this to a human.",
    "language": "en"
  }
}
```

Response:

```ts
AuthResponseDto
```

Status codes:

- `201` success
- `400` missing fields
- `500` registration failed

### Login

```http
POST /auth/login
```

Request:

```ts
LoginRequestDto
```

Example:

```json
{
  "email": "owner@example.com",
  "password": "change-me"
}
```

Response:

```ts
AuthResponseDto
```

Status codes:

- `200` success
- `400` missing fields
- `401` invalid credentials
- `500` login failed

### Get Current User Businesses

Returns businesses available to the logged-in user.

```http
GET /me/businesses
```

Auth: required.

Response:

```ts
BusinessSummaryDto[]
```

### Get Clients By Business

Returns clients that have conversations with a business.

```http
GET /businesses/:businessId/clients
```

Auth: required. User must have access to `businessId`.

Response:

```ts
ClientSummaryDto[]
```

Status codes:

- `200` success
- `400` invalid business id
- `401` missing/invalid token
- `403` business access denied
- `500` fetch failed

### Get Conversations By Business

Returns all conversations for a business.

```http
GET /businesses/:businessId/conversations
```

Auth: required. User must have access to `businessId`.

Optional query:

```http
?clientId=123
```

Response:

```ts
ConversationSummaryDto[]
```

Status codes:

- `200` success
- `400` invalid business id or client id
- `401` missing/invalid token
- `403` business access denied
- `500` fetch failed

### Get Conversations By Client And Business

Use the same endpoint as above with `clientId`.

```http
GET /businesses/:businessId/conversations?clientId=:clientId
```

Auth: required.

Response:

```ts
ConversationSummaryDto[]
```

### Get Messages By Conversation

Returns a conversation details object containing summary, transcript messages, and collected parameter answers.

```http
GET /businesses/:businessId/conversations/:conversationId/messages
```

Auth: required. User must have access to `businessId`.

Response:

```ts
ConversationMessagesResponseDto
```

Status codes:

- `200` success
- `400` invalid business id or conversation id
- `401` missing/invalid token
- `403` business access denied
- `404` conversation not found
- `500` fetch failed

## Recommended UI Screens

### Login Screen

- Form fields: email, password
- Calls `POST /auth/login`
- Stores JWT after success
- Redirects to business/conversation dashboard

### Business Selector

- Calls `GET /me/businesses`
- If one business exists, select it automatically
- If multiple businesses exist later, show a selector

### Clients Screen

- Calls `GET /businesses/:businessId/clients`
- Show phone number, conversation count, last conversation date
- Selecting a client opens conversations filtered by `clientId`

### Conversations Screen

- Calls `GET /businesses/:businessId/conversations`
- Or `GET /businesses/:businessId/conversations?clientId=:clientId`
- Show status, created time, message count, last message time, conclusion
- Selecting a conversation opens message details

### Conversation Details Screen

- Calls `GET /businesses/:businessId/conversations/:conversationId/messages`
- Show:
  - messages in chronological order
  - user/bot/system styling by `type`
  - collected params from `params`
  - conversation status and conclusion

## Notes For Future UI Work

- Do not hardcode business id. Use `/me/businesses` after login.
- Always attach JWT to protected requests.
- Treat `status` as display text for now; enums may become stricter later.
- The register endpoint is currently the bootstrap flow for creating a business and its owner user. A future production UI may split this into an admin/onboarding flow.
- The UI should tolerate empty arrays for clients, conversations, messages, and params.
