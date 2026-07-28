# Human Takeover — UI Integration Guide (Web + Mobile)

Audience: engineers building this against `voxis-ui` (Next.js) and `voxis-mobile-app` (Expo/React Native). Describes the new backend surface for human takeover: what data you now get on a conversation, which endpoints to call, and three things product explicitly asked about — knowing the channel, taking over, and ending a conversation.

All endpoints below require the same Bearer JWT auth already used by every other `/v1/businesses/:businessId/...` route, and the same business-membership rules (`requireBusinessAccess`).

## 1. What changed on data you already fetch

`GET /v1/businesses/:businessId/conversations` and `GET /v1/businesses/:businessId/conversations/:conversationId/messages` return the same `ConversationSummaryDto` as before, now with these fields added — **no new GET endpoint needed** to build the UI below:

```jsonc
{
  "id": 42,
  "businessId": 7,
  "clientId": 3,
  "status": "collecting",          // now can also be "humanTakeover"
  "channel": "whatsapp",           // "whatsapp" | "sms" | "voice" | "webchat"
  "provider": "twilio",            // "twilio" | "meta_whatsapp" | "internal"
  "conclusion": "...",
  "createdAt": "...",
  "messageCount": 12,
  "lastMessageAt": "...",
  "humanManaged": false,           // NEW — sticky, see below
  "takenOverByUserId": null,       // NEW
  "takenOverAt": null,             // NEW
  "releasedAt": null               // NEW
}
```

### How the UI knows the channel

Just read `channel` + `provider` directly off the conversation object — every conversation carries its own channel/provider (a client could in principle have separate WhatsApp and SMS conversations, so don't infer channel from the client, always read it per-conversation). Use `channel` to pick the icon/label (WhatsApp, SMS, etc.) and `provider` only if you need to distinguish the underlying integration (e.g. Twilio vs Meta Cloud API) for debugging/support views — end users don't need to see `provider`.

### How the UI knows the conversation's control state

Derive a single "who's driving" state from `status` + `humanManaged`:

| `status` | `humanManaged` | Meaning | UI treatment |
|---|---|---|---|
| anything except `humanTakeover` | `false` | Bot is answering normally | Normal automated-conversation view. Show a "Take over" action. |
| `humanTakeover` | `true` | A human currently owns this conversation | Show "You/​{agent name} is handling this" banner, message composer, and an "End conversation" action. |
| `ended` / `failure` / etc. | `true` | A human owned this before and closed it | Show a "Closed (human)" badge. **The bot will not respond to new client messages here** — see the caveat below. Offer "Resume / take over again" (calls the same takeover endpoint on this `conversationId`). |
| `ended` / `failure` / etc. | `false` | Bot closed this conversation itself | Normal closed-conversation view, exactly like today — a new client message will auto-restart the bot. |

`takenOverByUserId` tells you which agent owns/owned it — resolve it against your existing business-members list (`GET /v1/businesses/:businessId/members` or whatever you already use) to show a name/avatar.

## 2. New endpoints

### 2.1 Take over a conversation

```
POST /v1/businesses/:businessId/conversations/:conversationId/takeover
Body: { "clientId": number, "message": string }
```

- Call this when an agent clicks **"Take over"** on any conversation (bot-owned, or a previously-closed human-managed one they want to resume).
- `message` is **required** — the call both takes over *and* sends the agent's first message in one action. There's no "take over silently" mode today; if the agent wants to just watch without sending anything yet, that's a product decision to make (currently not supported).
- Effect, in order: the bot is blocked immediately (any bot reply already sitting in the outbound queue is cancelled — not just future ones), the conversation is marked `status: "humanTakeover"`, `humanManaged: true`, `takenOverByUserId` set to the caller, and the message is sent to the client over the conversation's existing channel/provider.
- Response: the updated `ConversationSummaryDto` — replace your local conversation state with it.

**Sending follow-up messages while you own the conversation**: there is currently no separate "send message" endpoint. Call **the same takeover endpoint again** for each subsequent message — it's safe to call repeatedly while you already own the conversation (it just re-confirms ownership and sends the new message). Treat "take over" and "send" as the same action in your composer while `status === "humanTakeover" && takenOverByUserId === me`. If this gets chatty in practice, flag it back to the backend team — a lighter dedicated send-message endpoint would be a clean follow-up, but isn't built yet.

### 2.2 End a conversation / release

```
POST /v1/businesses/:businessId/conversations/:conversationId/release
Body: { "clientId": number }
```

- Call this when the agent clicks **"End conversation"**.
- Effect: conversation status → `ended`, `releasedAt` set. **`humanManaged` stays `true` forever.**

**Important — this does *not* hand control back to the bot.** By design, once a conversation has had a human on it, it's permanently flagged `humanManaged` and the bot will never automatically re-engage it again, even after release — a later client message on it will just sit there (persisted + push-notified) waiting for a human. If your product spec actually wants "press this button and the bot resumes answering," **that isn't implemented today** and needs a new backend capability (something that flips `humanManaged` back to `false`). Please don't label this button "Return to bot" in either app — call it "End conversation" / "Close" so the copy matches reality. Flag this back if the literal hand-back-to-bot behavior is a hard requirement, and we'll add it.

### 2.3 Open a new conversation as a human

```
POST /v1/businesses/:businessId/conversations/open
Body: { "phoneNumber": string, "message": string, "clientName"?: string }
```

- Call this when an agent wants to proactively message a phone number — including one with **no existing client record** (find-or-create happens server-side).
- Effect: creates/reuses the `Client` by phone number, creates a brand-new `Conversation` already `status: "humanTakeover"`, `humanManaged: true`, sends `message`. The bot never sees this conversation.
- Response: `201` with the new `ConversationSummaryDto` — navigate straight into that conversation's thread using its `id`.
- Use `clientName` to set the display name on a newly-created client (ignored/updates existing name if the client already exists).

## 3. Real-time updates

Every message that lands on a `humanManaged` conversation writes a push-notification event (`CONVERSATION_MESSAGE_RECEIVED`) processed by the existing business-activity pipeline (same one used for task reminders today), delivered via Expo push to the owning agent's registered devices (`takenOverByUserId`).

- **Mobile**: you'll get a push with `title: "New message from a client"`, `body: <client phone number>`, and `payload: { conversationId, clientId }`. Deep-link into the conversation detail screen using `conversationId` — the app already knows the active `businessId` from context. **Known gap**: the payload does not currently include `businessId`. If an agent works across multiple businesses this is ambiguous — flag it back if that's a real scenario for your users, it's a small addition on our side.
- **Web**: there is no browser-push channel today — push devices are registered per mobile OS (`PhonePlatform: IOS | ANDROID | UNKNOWN`), nothing for web. Until we add one, poll the conversation list/detail endpoints on an interval for `humanManaged` conversations, or treat this as a follow-up if near-real-time web alerts are needed.
- The processor batch-polls every ~60s by default — so there's up to ~1 minute of latency on the notification, not instant. Flag if that's too slow for your use case; it's a config change, not an architecture change.

## 4. Error handling

All three endpoints follow the same shape as the rest of the API:

- `400` — missing/invalid `businessId`, `conversationId`, `clientId`, `message`, or `phoneNumber`.
- `403` — caller isn't a member of `businessId` (standard `requireBusinessAccess`).
- `404` — conversation/client not found for that business (takeover/release), or client lookup issue.
- `500` — unexpected failure (e.g. no outbound channel configured for the business/provider) — surface a generic retry-able error toast.

## 5. Summary checklist for implementers

- [ ] Show channel/provider from the conversation object you already fetch — no new call needed.
- [ ] Add the status/humanManaged decision matrix above to compute the "who's driving" badge.
- [ ] Wire "Take over" → `POST .../takeover` (and reuse it for every subsequent human-sent message).
- [ ] Wire "End conversation" → `POST .../release`, with copy that does **not** claim it hands back to the bot.
- [ ] Wire a "New conversation" entry point (by phone number) → `POST .../conversations/open`.
- [ ] Mobile: handle the `CONVERSATION_MESSAGE_RECEIVED` push, deep-link on `conversationId`.
- [ ] Flag back to backend if you need: silent takeover (no forced first message), a dedicated send-message endpoint, literal bot hand-back, `businessId` in the push payload, or faster notification latency.
