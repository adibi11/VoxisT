# Voxis

Voxis is a multi-tenant case and document workflow backend.

## Runtime components

- Express API: authentication, businesses, leads, cases, document requirements, bundles, uploads, verification, and client portal access.
- Lead outbox publisher: converts canonical form/API submissions into CRM leads.
- Inbound email worker: reads SES raw-email S3 events from SQS and stores validated attachments as case documents.
- S3 document worker: classifies and extracts uploaded documents.
- Case follow-up scheduler and worker: schedules and sends missing-document SMS reminders.

PostgreSQL is the system of record. Redis supports rate limiting and the retained BullMQ case-follow-up queue. S3 stores documents and raw inbound email; SQS delivers S3 events.

## Development

```bash
npm run build
TMPDIR=/tmp npm test
npm run dev
```

Local PostgreSQL and Redis are available through `docker-compose.yml`.

## Document storage

Required configuration:

- `DATABASE_URL`
- `DOCUMENTS_BUCKET_NAME`
- `AWS_REGION`
- `DOCUMENT_UPLOAD_MAX_BYTES` (optional; defaults to 25 MiB)
- `OPENAI_API_KEY` for document classification and extraction

AWS credentials use the default SDK credential chain. ECS deployments should use task roles.

## Inbound case email

The inbound-email worker additionally requires:

- `INBOUND_EMAIL_DOMAIN`
- `INBOUND_EMAIL_QUEUE_NAME`
- `INBOUND_EMAIL_RAW_BUCKET_NAME`

SES stores raw MIME messages in the raw bucket. S3 sends object-created events to the inbound SQS queue. Valid attachments are copied to the canonical document bucket and then processed by the S3 document worker.

## Generic lead ingestion

Owners create a `FORM`, `LANDING_PAGE`, or `CUSTOM_API` integration through:

```http
POST /v1/businesses/:businessId/integrations
```

The response returns a one-time integration secret and canonical submission endpoint. Producers submit leads server-to-server with `X-Voxis-Integration-Secret` and a stable external event ID.

## SMS reminders

Case document reminders use Twilio Messaging Services and require `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. Businesses configure an SMS sender through the SMS settings endpoints.
