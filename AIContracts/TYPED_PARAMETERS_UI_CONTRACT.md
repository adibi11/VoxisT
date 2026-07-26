# Typed Business Parameters — UI Contract

Business parameters are now **typed**. Every parameter the AI collects during a
conversation must live in a fixed, machine-learnable value space. The settings
UI must let the owner choose the type and its constraints; free-text parameters
can no longer be created.

## Why

Collected answers are stored twice: as the raw string (`paramAnswer`) and as a
normalized, typed projection (`valueCategory` / `valueNumber` / `valueTime`).
Because the value space is declared up front, answers can be fed into
analytics/ML directly — no per-business data cleaning.

## Parameter types

| `paramType`   | Meaning                          | `config` shape                                        | Stored projection |
|---------------|----------------------------------|-------------------------------------------------------|-------------------|
| `CATEGORICAL` | Closed set of allowed answers    | `{ "options": ["Tel Aviv", "Haifa"] }`                | `valueCategory`   |
| `CONTINUOUS`  | A number, optionally bounded     | `{ "min": 0, "max": 100000, "unit": "ILS" }` (all optional) | `valueNumber`     |
| `TIME`        | A concrete date or date+time     | none (send `null`)                                    | `valueTime` (ISO) |
| `TEXT`        | **Reserved.** System `Name` parameter and legacy rows only | none                        | none              |

The API **rejects** a save where an owner-defined parameter has `paramType`
`TEXT` (or no `paramType` at all) with `400 Invalid business settings request`
or a 500 whose message names the offending parameter. The `Name` parameter is
always forced to `TEXT` server-side regardless of what is sent.

## Endpoints

Unchanged paths, extended payloads:

- `GET /v1/businesses/:businessId/settings` — each entry of `parameters[]` now
  includes `paramType` and `config` (nullable).
- `POST /v1/businesses/:businessId/settings` — each entry of `parameters[]`
  must include `paramType` and, where applicable, `config`.

### Request fragment

```json
{
  "parameters": [
    { "id": 12, "paramName": "Name",         "use": true,  "paramType": "TEXT",        "config": null },
    { "id": 13, "paramName": "city",         "use": true,  "paramType": "CATEGORICAL", "config": { "options": ["Tel Aviv", "Haifa", "Jerusalem"] } },
    { "id": 14, "paramName": "budget",       "use": true,  "paramType": "CONTINUOUS",  "config": { "min": 0, "max": 100000, "unit": "ILS" } },
    {            "paramName": "preferredDate","use": true,  "paramType": "TIME",        "config": null }
  ]
}
```

## Validation rules (mirror these client-side)

- `CATEGORICAL`
  - `config.options` required, **2–30** entries.
  - Each option: non-empty trimmed string, ≤ 160 chars.
  - Options must be unique case-insensitively ("VIP" vs "vip" is a duplicate).
- `CONTINUOUS`
  - `min`, `max`, `unit` all optional.
  - If both bounds are set, `min < max`.
  - `unit` is a display label ("ILS", "kg", "guests"); it does not convert values.
- `TIME`
  - No config. Answers are normalized to ISO 8601 by the backend.
- Parameter names must be unique per business (case-insensitive), non-empty.
- `Name` is system-managed: show it, allow toggling `use`, but do not offer a
  type picker for it.

## Suggested settings UX

1. **Type picker per parameter row** — a segmented control / select with three
   choices: `Choice list`, `Number`, `Date & time`. (Never expose "TEXT".)
2. **Choice list** → a chips/tag editor for `options`. Enforce 2 minimum before
   enabling save; dedupe case-insensitively as the user types.
3. **Number** → optional `min` / `max` numeric inputs plus an optional short
   `unit` text field. Validate `min < max` inline.
4. **Date & time** → no extra inputs; show a hint like "The AI will collect a
   concrete date/time (e.g. tomorrow 15:00 → 2026-07-28T15:00)".
5. **Legacy parameters** (returned with `paramType: "TEXT"` after the
   migration) — surface a "needs setup" badge and block saving the settings
   form until the owner assigns one of the three types. The backend rejects
   the save otherwise, so make the requirement visible before submit.

## How this affects conversations (for context)

- The extraction prompt lists each active parameter with its type spec
  (allowed options / bounds+unit / ISO time) and instructs the model to emit
  only normalized values — the exact option spelling, a plain number, or an
  ISO 8601 timestamp resolved against the current date.
- Values that don't map cleanly are dropped, never stored as free text; the
  bot simply keeps asking/clarifying.
- Displaying answers: keep using `paramValue` (raw) in transcripts; typed
  projections are for analytics.
