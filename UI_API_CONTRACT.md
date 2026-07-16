# VoxisT UI API Contract

This document is the source of truth for the React UI. Build UI API clients and screens according to these DTOs and endpoints.

## Base Rules

- API base URL in local development: `http://localhost:3000/v1` (use it as an environment variable). All endpoint paths below are relative to this versioned base URL.
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
  platformRole: "admin" | "user";
  businessIds: number[];
  businessMemberships: {
    businessId: number;
    role: "owner" | "admin" | "member";
  }[];
};
```

### `AuthResponseDto`

```ts
type AuthResponseDto = {
  token: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
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

### `BusinessContext` DTOs

```ts
type BusinessContextProfileDto = {
  // Max 120 chars.
  name: string;
  // Max 40 chars. Prefer BCP-47 language tags such as "en" or "he".
  language: string;
  // Max 200 chars.
  tone: string;
};

type UpsertBusinessContextRequestDto = {
  businessProfile: BusinessContextProfileDto;
  // Max 1200 chars.
  description?: string | null;
  // UI should store prompt-safe structured data.
  // Recommended shape:
  // {
  //   allowedServices: string[]; // max 30 items, max 160 chars each
  //   commonIntents: string[];   // max 20 items, max 160 chars each
  // }
  serviceCatalog: unknown;
  // UI should store prompt-safe structured data.
  // Recommended shape:
  // {
  //   paceWhen: string[];     // max 10 items, max 180 chars each
  //   escalateWhen: string[]; // max 10 items, max 180 chars each
  //   closeWhen: string[];    // max 10 items, max 180 chars each
  // }
  conversationPolicy: unknown;
  // Optional and sensitive. Use only safe, reusable context.
  // Recommended shape:
  // {
  //   summary?: string;                         // max 600 chars
  //   reusablePreferences: string[];            // max 10 items, max 160 chars each
  //   previousAnswers: Record<string, string>;  // max 20 entries, key max 80 chars, value max 200 chars
  // }
  knownClientContext?: unknown;
};

type BusinessContextResponseDto = {
  id?: number;
  businessId: number;
  businessProfile: BusinessContextProfileDto;
  description?: string | null;
  serviceCatalog: unknown;
  conversationPolicy: unknown;
  knownClientContext?: unknown;
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

### Platform Admin: Get All Businesses

Returns all businesses for the platform admin dashboard.

```http
GET /admin/businesses
```

Auth: required. User must have `platformRole: "admin"`.

Response:

```ts
BusinessSummaryDto[]
```

Status codes:

- `200` success
- `401` missing/invalid token
- `403` platform admin access required
- `500` fetch failed

### Save Business Context

Creates or replaces the business context used for future conversation management and prompt-context assembly.

```http
PUT /businesses/:businessId/context
```

Auth: required. User must have access to `businessId`.

Request:

```ts
UpsertBusinessContextRequestDto
```

Example:

```json
{
  "businessProfile": {
    "name": "Example Cleaning",
    "language": "en",
    "tone": "warm, concise, professional"
  },
  "description": "Residential and small-office cleaning company.",
  "serviceCatalog": {
    "allowedServices": ["home cleaning", "office cleaning", "deep cleaning"],
    "commonIntents": ["quote request", "schedule cleaning", "reschedule visit"]
  },
  "conversationPolicy": {
    "paceWhen": ["price concern", "confusion", "hesitation"],
    "escalateWhen": ["angry customer", "unsupported service", "urgent complaint"],
    "closeWhen": ["required params collected", "customer confirms no more questions"]
  },
  "knownClientContext": {
    "safeUse": true,
    "notes": []
  }
}
```

Response:

```ts
BusinessContextResponseDto
```

Status codes:

- `200` saved
- `400` invalid business id or invalid business context
- `401` missing/invalid token
- `403` business access denied
- `500` save failed

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
