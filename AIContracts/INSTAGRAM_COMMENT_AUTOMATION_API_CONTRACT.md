# Instagram Comment Automation API Contract

## Scope

This module uses a dedicated Meta app and Instagram API with Instagram Login. It does not share OAuth configuration, callback URLs, credentials, or code with Meta Lead Ads. This phase implements authorization, account/media discovery, persistence, and rule configuration. Comment webhooks and outbound public/private replies are intentionally not active yet.

## OAuth and resources

1. Create a connection with `POST /v1/businesses/:businessId/instagram-comment-automations/connections`.
2. Request an OAuth ticket with `POST /v1/businesses/:businessId/instagram-comment-automations/connections/:connectionId/authorize-ticket`.
3. Navigate to the returned `authorizationUrl`. The backend redirects through `/v1/integrations/instagram-comments/authorize` to Instagram.
4. Instagram returns to the dedicated callback `/v1/integrations/oauth/instagram-comments/callback`.
5. The backend exchanges the code, encrypts the long-lived token, synchronizes the professional account and its media, activates the connection, and redirects to the configured frontend URL.

## Endpoints

- `POST /v1/businesses/:businessId/instagram-comment-automations/connections`
- `POST /v1/businesses/:businessId/instagram-comment-automations/connections/:connectionId/authorize-ticket`
- `GET /v1/integrations/instagram-comments/authorize?ticket=...`
- `GET /v1/integrations/oauth/instagram-comments/callback?code=...&state=...`
- `GET /v1/businesses/:businessId/instagram-comment-automations/connections/:connectionId/account`
- `POST /v1/businesses/:businessId/instagram-comment-automations/connections/:connectionId/media/sync`
- `GET /v1/businesses/:businessId/instagram-comment-automations/connections/:connectionId/media`
- `GET /v1/businesses/:businessId/instagram-comment-automations/connections/:connectionId/rules`
- `POST /v1/businesses/:businessId/instagram-comment-automations/connections/:connectionId/rules`
- `PATCH /v1/businesses/:businessId/instagram-comment-automations/connections/:connectionId/rules/:ruleId`

All business endpoints require an owner JWT. OAuth navigation uses a five-minute, Redis-backed, one-use ticket. The callback validates a signed ten-minute state. Tokens are encrypted at rest and are never returned to the UI.

## Rule body

```json
{
  "instagramMediaId": 42,
  "name": "Send the guide",
  "keywords": ["guide", "send me"],
  "matchType": "ANY_KEYWORD",
  "publicReplyText": "Check your messages.",
  "privateReplyText": "Here is the guide: https://example.com/guide",
  "status": "DISABLED"
}
```

Keep rules disabled until the webhook processor and outbound sender are deployed.

## Environment

```text
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_GRAPH_API_VERSION=vXX.X
INSTAGRAM_OAUTH_REDIRECT_URI=https://api.example.com/v1/integrations/oauth/instagram-comments/callback
INSTAGRAM_OAUTH_FRONTEND_REDIRECT=https://app.example.com/settings/integrations/instagram
INSTAGRAM_OAUTH_STATE_SECRET=
INSTAGRAM_INTEGRATION_CREDENTIAL_ENCRYPTION_KEY=
```

`INSTAGRAM_OAUTH_STATE_SECRET` should be a high-entropy random secret. `INSTAGRAM_INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` must be a base64-encoded 32-byte key. Do not reuse the Lead Ads app secret or OAuth configuration.

## Meta app setup

Create a Business-type Meta app, add Instagram API with Instagram Login, configure the exact callback above as a valid OAuth redirect URI, add test professional accounts while developing, and request Advanced Access for `instagram_business_basic`, `instagram_business_manage_comments`, and `instagram_business_manage_messages` before serving external customers. Configure the frontend redirect only in VoxisT; it is not the Meta callback.

## Remaining work

Add a separately signed Instagram webhook at a dedicated URL, subscribe the app/account to `comments` (and optionally `live_comments`), persist webhook events idempotently, match enabled rules, enqueue delivery, publish the optional public reply, and send the one allowed private reply. This is separate because webhook acknowledgement must be fast, retries must not duplicate messages, Meta enforces reply windows, and outbound results need an audit trail.