# Meta Lead Ads — Part B: VoxisT Backend Configuration

## Purpose and scope

This document specifies the backend and deployment configuration required before
business owners can connect Meta Lead Ads. It does not implement the owner-facing
onboarding flow; that is Part C.

The integration uses one VoxisT-owned Meta App and one global webhook endpoint.
The application resolves the correct business only after verifying Meta's request
and matching Meta Page/form identifiers to an active `IntegrationConnection`.

```
Meta Lead Ads event
  -> global Meta webhook
  -> signature verification
  -> Page/form connection resolver
  -> Meta lead hydration
  -> CanonicalLeadSubmission
  -> LeadIngestionService
```

`businessId` from a Meta payload must never be trusted or used as tenant identity.

## Current implementation status

Implemented in this repository:

- `GET` challenge and `POST` signature-verification handlers at
  `/v1/webhooks/leads/meta`;
- route-specific raw-body parsing before the global JSON parser;
- Page/form-based lookup of an active Meta `IntegrationConnection`;
- durable, idempotent storage of verified Meta `leadgen` notifications in
  `ProviderWebhookEvent`;
- CORS defaults for `https://voxistudio.com` and
  `https://www.voxistudio.com`.

Deliberately deferred to Part C:

- business-owner OAuth initiation and callback;
- encrypted credential storage and token refresh;
- Page/form discovery and owner selection;
- Meta Graph API lead hydration;
- activation of a pending connection after a test lead.

The webhook inbox prevents verified notifications from being discarded while the
hydration processor is added. It does not create a CRM lead until hydration can
produce a complete canonical submission.

## Environment configuration

Configure these values independently for each deployment environment. Store all
secrets in the deployment secret manager, never in the repository, browser, or
`IntegrationConnection.config` JSON.

| Variable | Owner | Purpose |
|---|---|---|
| `META_APP_ID` | Platform admin | Identifies the VoxisT Meta App. |
| `META_APP_SECRET` | Platform admin | Validates webhook signatures and OAuth exchanges. |
| `META_WEBHOOK_VERIFY_TOKEN` | Platform admin | Validates Meta's GET webhook challenge. |
| `META_OAUTH_REDIRECT_URI` | Platform admin | Exact registered OAuth callback URI. |
| `META_GRAPH_API_VERSION` | Platform admin | Explicit Meta Graph API version, never an implicit default. |
| `META_OAUTH_STATE_SECRET` | Platform admin | Signs short-lived OAuth state. |
| `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` | Platform admin | Encrypts business-authorized access/refresh tokens at rest. |

Production values use the production API domain. Staging must use separate
credentials and, preferably, a separate Meta App so test users/assets and tokens
cannot cross into production.

```
Production callback: https://api.voxist.com/v1/...
Staging callback:    https://api-staging.voxist.com/v1/...
```

## Required backend endpoint contracts

### `GET /v1/webhooks/leads/meta`

**Caller:** Meta only.

**Purpose:** Prove that VoxisT controls the global callback URL during Meta webhook
configuration.

**Required behavior:**

1. Read `hub.mode`, `hub.verify_token`, and `hub.challenge` query parameters.
2. Require the expected subscribe mode.
3. Compare `hub.verify_token` to `META_WEBHOOK_VERIFY_TOKEN` with a safe string
   comparison.
4. Return `hub.challenge` as plain text with HTTP 200 when valid.
5. Return HTTP 403 without disclosing expected values when invalid.

This route does not resolve a business or create an `IncomingLead`.

### `POST /v1/webhooks/leads/meta`

**Caller:** Meta only.

**Purpose:** Receive lead-generation notifications.

**Required behavior:**

1. Preserve the exact raw request bytes before JSON parsing.
2. Validate `x-hub-signature-256` using HMAC-SHA256 and `META_APP_SECRET`.
3. Reject invalid/missing signatures with HTTP 401; never parse or persist their
   payload as an accepted lead.
4. Parse only a verified body.
5. Extract `page_id`, `form_id`, and `leadgen_id` from each supported leadgen
   change.
6. Resolve exactly one active `IntegrationConnection` using the provider scope.
7. Create a Meta hydration task or invoke the Meta lead ingestion adapter.
8. Return HTTP 200 quickly after durable acceptance; do not perform long-running
   Graph API calls in the webhook response.

The webhook notification is a signal. The full lead data is retrieved separately
using the business-authorized credential and `leadgen_id`.

### `GET /v1/integrations/oauth/meta/callback`

**Caller:** Meta OAuth redirect only.

**Purpose:** Complete an authorization started by a business owner.

**Required behavior:**

1. Require either an OAuth `code` or a provider error response.
2. Validate signed OAuth `state`: expiry, nonce, initiating owner ID, business ID,
   and pending connection ID.
3. Exchange `code` server-to-server using `META_APP_SECRET`.
4. Encrypt credentials before persistence; never expose them in redirect URLs,
   API responses, logs, or browser storage.
5. Start asynchronous discovery of the owner's accessible Pages and lead forms.
6. Redirect the owner to the integration UI with a non-sensitive result code.

This callback must not activate the connection. Activation occurs only after the
owner selects a provider resource and verification succeeds.

### `POST /v1/integrations/meta/data-deletion`

**Caller:** Meta only, if configured as the app's automated deletion callback.

**Purpose:** Receive a Meta-signed request related to deletion of Meta user data.

**Required behavior:**

1. Validate Meta's signed request before reading identifiers.
2. Create an auditable deletion request.
3. Execute the documented deletion/anonymization policy.
4. Return Meta's required confirmation payload and a public status URL.
5. Do not make deletion depend on a currently active integration connection.

This endpoint complements, but does not replace, the public data-deletion
instructions page.

## Request-body handling

The current application globally calls `express.json()`. Meta signature validation
needs the untouched raw body, so the implementation must register the Meta webhook
before the global JSON parser or configure a route-specific raw-body `verify`
handler. It must then parse the verified raw body once.

Do not add an unverified generic JSON route and attempt to reconstruct raw bytes;
that can invalidate an HMAC signature.

## Connection resolution policy

Meta connections are initially one form per connection:

```
IntegrationConnection
  provider: "meta"
  integrationType: LEAD_ADS
  status: ACTIVE
  externalAccountId: Meta ad account ID
  externalResourceId: Meta lead form ID
  config: { pageId: Meta Page ID, formId: Meta form ID }
```

Resolver algorithm:

1. Verify Meta request authenticity.
2. Extract Meta Page ID and form ID.
3. Find one `ACTIVE` connection whose provider is `meta`, whose selected form is
   the incoming form, and whose configured Page matches.
4. Reject and alert when zero or more than one connection matches.
5. Return only the trusted `connectionId` and its `businessId`.

The internal `connectionToken` remains useful for management and direct/internal
flows, but Meta's app-level callback does not use it to route an inbound webhook.

## Lead hydration and normalization

After resolution, the Meta adapter uses the encrypted credential belonging to the
resolved connection to retrieve the lead represented by `leadgen_id`.

It maps provider data as follows:

| Meta data | VoxisT canonical field |
|---|---|
| `leadgen_id` | `source.externalLeadId` |
| Meta notification ID, where supplied | `source.externalEventId` |
| Page/form IDs | resolver scope and attribution |
| field data | `person` and `answers.fields` |
| campaign/ad/adset information | `attribution` |

The adapter sends only `CanonicalLeadSubmission` to `LeadIngestionService`. Raw
Meta payloads are retained only in the immutable receipt according to the product
retention policy.

## Required observability

Log correlation identifiers but never raw lead PII, app secrets, OAuth codes, or
access tokens.

Required metrics and alerts:

- webhook signature failures;
- unresolved Page/form events;
- hydration failures and retry age;
- OAuth callback failures;
- connection verification failures;
- time from webhook receipt to `IncomingLead.PROCESSED`;
- expired/revoked credential errors.

## CORS and network policy

`https://voxistudio.com` and `https://www.voxistudio.com` are included in the API
default CORS allowlist for browser-based VoxisT UI calls.

Meta webhooks and OAuth redirects are server-to-server/browser navigation flows;
they do not rely on CORS. The callback URLs must instead be public HTTPS endpoints
reachable by Meta.

If `CORS_ORIGINS` is set in an environment, it replaces the default. Include both
VoxisT production origins in that environment variable as well.

## Done definition for Part B

Part B is complete only when:

1. Separate staging/production Meta app secrets are deployed.
2. The webhook GET challenge and POST signature validation are tested.
3. OAuth state validation and encrypted credential persistence are tested.
4. A verified Meta Page/form can resolve to one business connection.
5. A test `leadgen_id` can be hydrated and pass through canonical ingestion.
6. Invalid signatures, expired OAuth state, and unknown Page/form values are
   rejected without creating an `IncomingLead`.
