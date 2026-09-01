# Landing Page Integration — UI and Developer Contract

## Owner UI flow

Only a business owner (or platform admin) can create a landing-page integration.
The UI calls `POST /v1/businesses/:businessId/integrations` with:

```json
{ "provider": "landing_page", "integrationType": "LANDING_PAGE", "displayName": "Website quote form", "config": { "formName": "Quote request" } }
```

The response contains the connection, a submission endpoint, and an
`integrationSecret`. Show the endpoint and secret in a copyable developer
handoff panel. The secret is returned only at creation time; warn the owner to
copy it now and never expose it in browser JavaScript.

The landing-page connection is immediately `ACTIVE`; it has no OAuth or
provider verification step. The UI should offer disable/recreate controls. A
future secret-rotation endpoint can replace a lost secret without recreating
the connection.

## Submission endpoint behavior

`POST /v1/lead-submissions/:connectionToken` is a single generic lead
submission endpoint. `FORM`, `LANDING_PAGE`, and `CUSTOM_API` producers all use
the one-time `X-Voxis-Integration-Secret` for server-to-server submission.

## Developer handoff

Send the form from the client's backend or serverless function, not directly
from browser JavaScript:

```http
POST {submissionEndpoint}
Content-Type: application/json
X-Voxis-Integration-Secret: {integrationSecret}
```

`externalEventId` must be unique for each form submission. Reusing it returns
`202` with `duplicate: true` and never creates another CRM lead.

## Request body

Minimum valid body:

```json
{
  "externalEventId": "website-submission-123",
  "person": { "fullName": "Jane Doe", "email": "jane@example.com" }
}
```

At least one identity value is required: `fullName`, `firstName`, `lastName`,
`email`, or `phone`. The developer may additionally submit:

- `answers.fields`: arbitrary form answers, each with `key`, optional `label`,
  `value`, and optional `valueType` (`text`, `number`, `boolean`, `date`,
  `choice`, or `unknown`).
- `attribution`: `landingPageUrl`, `referrer`, UTM values, form identity,
  campaign, ad, and ad-set identifiers/names where known.
- `consent`: marketing/contact consent, timestamp, text version, and allowed
  contact channels.
- `metadata`: provider-specific primitive values and tags.

Example:

```json
{
  "externalEventId": "website-submission-123",
  "person": { "fullName": "Jane Doe", "email": "jane@example.com", "phone": "+972501234567" },
  "answers": { "fields": [{ "key": "service", "label": "Requested service", "value": "Renovation", "valueType": "choice" }] },
  "attribution": { "landingPageUrl": "https://client.example/quote", "utm": { "source": "google", "campaign": "summer" } },
  "consent": { "contact": { "granted": true, "capturedAt": "2026-07-20T13:00:00.000Z", "channels": ["phone", "email"] } }
}
```

The API responds `202` with `{ "incomingLeadId": number, "duplicate": boolean }`.
