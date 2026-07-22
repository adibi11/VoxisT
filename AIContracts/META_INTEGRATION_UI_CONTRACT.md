# Meta Lead Ads Integration — UI and API Contract

## Scope

This document defines the first business-owner UI flow for connecting **Meta Lead
Ads** to VoxisT.

The first release must display and create only `meta` + `LEAD_ADS` connections.
The API and UI state model remain provider-neutral so Google Ads and other
providers can use the same integration-management shell later.

```
Current UI option:   Meta Lead Ads
Reserved for later:  Google Lead Forms, TikTok, Typeform, Webflow, Custom API
```

No access token, OAuth authorization code, app secret, webhook secret, or
encrypted credential is ever returned to the UI.

## Roles

| Actor | Responsibilities |
|---|---|
| Platform admin | Configures the VoxisT Meta App and deployment secrets. Does not authorize a customer's Meta account. |
| Business owner | Creates, authorizes, configures, verifies, and disconnects that business's Meta connection. |
| Business member | May view integrations when granted business access, but cannot change them. |
| Meta | Calls the OAuth callback and webhook endpoints. It is not a VoxisT browser user. |

## Connection states

| State | Meaning | UI action |
|---|---|---|
| `PENDING` | Connection exists but needs authorization, resource selection, or verification. | Show the next required step. |
| `ACTIVE` | Verified and eligible for real lead processing. | Show active status and disconnect action. |
| `FAILED` | Configuration, credential, or verification failed. | Show safe failure text and reconnect/retry action. |
| `DISABLED` | Owner disconnected it. | Do not process new leads; allow a new connection to be created. |

For the current backend, successful OAuth and resource selection leave the
connection `PENDING`. It becomes `ACTIVE` only after the forthcoming hydration and
test-lead verification implementation.

## UI route and screen

Suggested UI route:

```
/settings/integrations/meta
```

The screen has four states:

1. **No connection** — show `Connect Meta Lead Ads`.
2. **Authorization pending** — show `Continue with Meta`.
3. **Authorized, resource unselected** — show Page/form picker.
4. **Resource selected, awaiting verification** — show Meta test-lead steps.
5. **Active/disabled/failed** — show status, details, and allowed actions.

The UI should derive the next state from the returned connection data, not keep a
separate client-only onboarding state machine.

## API contracts

### Create a Meta connection

```
POST /v1/businesses/:businessId/integrations
Authorization: Bearer <VoxisT JWT>
```

Request:

```json
{
  "provider": "meta",
  "integrationType": "LEAD_ADS",
  "displayName": "Facebook Lead Ads"
}
```

Response: `201 Created`

```json
{
  "id": 123,
  "businessId": 7,
  "provider": "meta",
  "integrationType": "LEAD_ADS",
  "status": "PENDING",
  "connectionToken": "opaque-internal-value",
  "displayName": "Facebook Lead Ads",
  "externalAccountId": null,
  "externalResourceId": null,
  "config": {
    "authorizationStatus": "NOT_STARTED"
  },
  "hasCredentials": false,
  "hasWebhookSecret": false,
  "createdAt": "...",
  "updatedAt": "..."
}
```

The UI should retain only `id` as its onboarding reference. It must not use the
connection token to call Meta or treat it as a credential.

### List integrations

```
GET /v1/businesses/:businessId/integrations
Authorization: Bearer <VoxisT JWT>
```

Response: `200 OK`

```json
{
  "items": ["IntegrationConnection DTO"]
}
```

For now, UI filters to:

```ts
connection.provider === "meta" &&
connection.integrationType === "LEAD_ADS"
```

Later, it can render a provider catalog without changing this endpoint.

### Get a connection

```
GET /v1/businesses/:businessId/integrations/:connectionId
Authorization: Bearer <VoxisT JWT>
```

Use this when returning from OAuth and when polling/reloading a configuration
screen.

### Create an OAuth-start ticket — authenticated API call

```
POST /v1/businesses/:businessId/integrations/:connectionId/meta/authorize-ticket
Authorization: Bearer <VoxisT JWT>
```

Response: `201 Created`

```json
{
  "authorizationUrl": "/v1/integrations/meta/authorize?ticket=opaque-one-time-ticket"
}
```

### Important browser-authentication constraint

The current API expects the VoxisT JWT in an `Authorization: Bearer` header. A
normal `window.location.assign()` cannot add that header.

The ticket is opaque, Redis-backed, valid for five minutes, and consumed exactly
once. It is bound to the owner, business, and connection. The UI should prepend
its API base URL, then navigate the browser:

```ts
const { authorizationUrl } = await api.post(/* authorize-ticket */)
window.location.assign(`${apiBase}${authorizationUrl}`)
```

Do **not** put the normal JWT in a query string.

### Consume OAuth-start ticket — browser navigation only

```
GET /v1/integrations/meta/authorize?ticket=...
```

This endpoint requires no Bearer header. It consumes the one-time ticket and
returns the HTTP 302 redirect to Meta's consent screen.

### OAuth callback — Meta/browser only

```
GET /v1/integrations/oauth/meta/callback?code=...&state=...
```

The UI never calls this endpoint.

Meta redirects the owner's browser here after approval. The backend validates
state, exchanges the code with Meta, encrypts credentials, saves them, then sends
another 302 redirect to:

```
META_OAUTH_FRONTEND_REDIRECT?connectionId=123&authorized=true
```

Suggested configuration:

```text
META_OAUTH_FRONTEND_REDIRECT=https://voxistudio.com/settings/integrations/meta
```

On UI load, read `connectionId` and `authorized`, clear those query parameters
from the browser history, then call `GET .../:connectionId`.

### Discover Meta resources

```
GET /v1/businesses/:businessId/integrations/:connectionId/meta/resources
Authorization: Bearer <VoxisT JWT>
```

Response: `200 OK`

```json
{
  "pages": [
    {
      "id": "555",
      "name": "Example Page",
      "forms": [
        { "id": "999", "name": "Request a Consultation" }
      ]
    }
  ]
}
```

The UI renders the Page/form selector. Page access tokens are server-only and
must not be included in this response.

### Select a Page/form

```
POST /v1/businesses/:businessId/integrations/:connectionId/meta/resource
Authorization: Bearer <VoxisT JWT>
```

Request:

```json
{
  "pageId": "555",
  "formId": "999"
}
```

The backend re-discovers resources and rejects IDs that are not actually
authorized for that connection. The UI must not assume that a selected-looking
resource is valid until this call succeeds.

### Request test-lead verification

```
POST /v1/businesses/:businessId/integrations/:connectionId/meta/verification
Authorization: Bearer <VoxisT JWT>
```

Response:

```json
{
  "connectionId": 123,
  "status": "PENDING",
  "verificationStatus": "AWAITING_TEST_LEAD",
  "testLeadUrl": "https://developers.facebook.com/tools/lead-ads-testing"
}
```

The UI opens the supplied URL in a new tab and explains that the owner must choose
the configured Page/form and create a test lead. The UI then refreshes the
connection status. Do not mark it active optimistically.

### Disable a connection

```
POST /v1/businesses/:businessId/integrations/:connectionId/disable
Authorization: Bearer <VoxisT JWT>
```

The UI asks for confirmation, then refreshes the returned connection. A disabled
connection must no longer appear as a usable lead source.

## Redirection sequence

```
1. UI creates PENDING connection                         (JSON API)
2. UI requests one-time OAuth-start ticket               (JSON API)
3. Browser navigates to authorize URL with ticket         (302)
4. Meta displays consent screen                           (Meta UI)
5. Meta redirects browser to VoxisT callback              (302 request)
6. Backend exchanges code and encrypts credential         (server-to-server)
7. Backend redirects browser to VoxisT UI                 (302)
8. UI loads connection, fetches Pages/forms, selects one  (JSON APIs)
9. Owner creates test lead                                (Meta tool)
10. Meta webhook verifies/resolves notification           (server-to-server)
```

## Provider-extension design

The UI must not hardcode Meta behavior across the entire integrations screen.
Only the current provider card and Meta detail panel are Meta-specific.

Use a future provider descriptor shape:

```ts
type IntegrationProviderDescriptor = {
  provider: "meta" | "google" | string;
  integrationType: "LEAD_ADS" | "FORM" | string;
  displayName: string;
  connectionMode: "oauth" | "manual_webhook" | "api_key";
  enabled: boolean;
};
```

Initial UI catalog:

```ts
[
  {
    provider: "meta",
    integrationType: "LEAD_ADS",
    displayName: "Meta Lead Ads",
    connectionMode: "oauth",
    enabled: true
  }
]
```

Future Google entry, disabled until backend support exists:

```ts
{
  provider: "google",
  integrationType: "LEAD_ADS",
  displayName: "Google Lead Forms",
  connectionMode: "oauth",
  enabled: false
}
```

Google will reuse the generic create/list/get/disable lifecycle. It will add a
Google authorization adapter and a provider-specific resource-selection panel.
The common integration screen, business ownership checks, connection states, and
safe API DTOs stay unchanged.

## Implementation plan

1. Build the Meta-only settings screen and connection list.
2. Add create, reload, resource-select, verification, and disable actions.
3. Add the short-lived OAuth-start-ticket endpoint before wiring the authorize
   button.
4. Test OAuth redirects on deployed staging with a Meta test app/Page/form.
5. Add lead hydration and automatic test verification activation.
6. Add a generic provider catalog component only after Meta works end-to-end.
7. Add Google as the next provider adapter without changing the generic
   integration lifecycle.
