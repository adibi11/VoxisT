# Business Channel Credentials — UI Contract

Messaging credentials are now **per business**, not platform-wide. During
onboarding, a business that uses Twilio provides its subaccount credentials;
they are AES-256-GCM encrypted and stored on the business's `BusinessChannel`
row. The backend then resolves everything by phone number:

- **Inbound**: a Twilio webhook is matched to a business by the *receiving*
  number (`To`), and its signature is validated with that business's own
  subaccount auth token.
- **Outbound**: the worker sends with the credentials of the channel matching
  the business + `from` number (falling back to the business's default channel).

The UI's job is to collect the credentials and the channel's phone number at
onboarding, and to show connection status.

## Endpoints

Both are existing routes, now credential-aware. Auth: `Bearer` token of a
business **owner** (member access is not enough).

### List channels

`GET /v1/businesses/:businessId/channels`

```json
{
  "channels": [
    {
      "id": 3,
      "businessId": 7,
      "channel": "whatsapp",
      "provider": "twilio",
      "displayName": "Main WhatsApp line",
      "status": "active",
      "onboardingType": "manual",
      "externalAccountId": "ACxxxxxxxx",
      "externalPhoneNumberId": "+972521234567",
      "webhookUrl": null,
      "isDefault": true,
      "hasCredentials": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

`hasCredentials` is the only credential signal the API ever returns. Secrets
are never included in any response — do not build UI that expects to re-read
them; offer "Replace credentials" instead.

### Create / update a channel

`POST /v1/businesses/:businessId/channels`

Upsert key is `(businessId, channel, provider)` — posting the same pair again
updates the row.

```json
{
  "channel": "whatsapp",
  "provider": "twilio",
  "displayName": "Main WhatsApp line",
  "status": "active",
  "externalAccountId": "ACxxxxxxxx",
  "externalPhoneNumberId": "+972521234567",
  "isDefault": true,
  "credentials": {
    "accountSid": "ACxxxxxxxx",
    "authToken": "the-subaccount-auth-token"
  }
}
```

`credentials` semantics:

| Value      | Effect                          |
|------------|---------------------------------|
| omitted    | keep stored credentials as-is   |
| `null`     | delete stored credentials       |
| object     | replace stored credentials      |

Per-provider required fields inside `credentials`:

| provider        | fields                          |
|-----------------|---------------------------------|
| `twilio`        | `accountSid`, `authToken` (of the **subaccount** that owns the number) |
| `meta_whatsapp` | `accessToken`, `phoneNumberId`  |

Validation: when `credentials` is an object it must contain at least one
recognized field and every present field must be a non-empty string, else
`400 Invalid business channel request`.

## Onboarding UX requirements

1. **Twilio connect form**: Account SID, Auth Token, and the WhatsApp-enabled
   phone number in E.164 (`+972...`). Send the number as
   `externalPhoneNumberId` — this is the lookup key for inbound routing, so it
   is **required** for the channel to receive messages.
2. On successful save, set `status: "active"` and `isDefault: true` for the
   business's first channel. Channels with status `disabled`/`failed` are
   excluded from message routing.
3. Show the webhook URL the customer must paste into the Twilio console:
   `POST {API_ORIGIN}/v1/webhook` (the number itself identifies the business;
   the legacy `/v1/webhook/:businessId` form still works for old setups).
4. Secret handling in the UI: password-type inputs, never echo saved values,
   show `hasCredentials` as a "Connected ✓ / Not connected" badge, and offer
   "Replace" (send new object) and "Disconnect" (send `credentials: null`).
5. Meta WhatsApp uses the same form with Access Token + Phone Number ID.

## Backend env (ops, not UI)

- `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` — base64 32-byte key; already used
  for lead-ads secrets, now also encrypts channel credentials.
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — legacy fallback only, used when
  a business has no channel credentials yet.
- `TWILIO_WEBHOOK_BASE_URL`, `TWILIO_VALIDATE_SIGNATURE` — signature
  validation of inbound webhooks (see RATE_LIMITING.md-style env docs).
