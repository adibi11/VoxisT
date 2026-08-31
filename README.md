This project is called VoxisAI.

The idea of he project is to provide an AI assitant to small to meduim  businesses, that minimize lead lost and to get crucial
information before even calling to the client.

The design of the business logic was followed by the onbaording ida, and the businesses mangement.

Each business can list in the application few featuers that seems to him crucial and the AI assitant needs to try
and extract theem from the client while keeping on conversational features such as 'pacing', 'leading', 'reflecting'.

Therefore in order to get a client message we must have a business that associates with the particular number and business ID.
From there cam the idea of the database design which can be showed in prisma/schema.prisma in this project.

The conversation it self is statefull, but the worker that handle messages is not.
We manage the conversation state in redis based on collected parameters from the AI assistant, by a state machine that is loaded and managed in the worker.
In each message and generated response, we update both the state in redis and in the DB in case of redis evacuation or collapses.
That way the system can regenerate the state from the DB. There for in each message we are updating the DB. Later it can be showed on the UI side.

We also hold keys for conversations to take care of concurrency




### Document upload configuration

The document upload-request endpoint uses the AWS SDK default credential provider chain. Configure only:

- `DOCUMENTS_BUCKET_NAME`: private S3 bucket used for document objects.
- `AWS_REGION`: AWS region containing the bucket.
- `DOCUMENT_UPLOAD_MAX_BYTES` (optional): maximum accepted upload size in bytes; defaults to 26214400 (25 MiB).

Do not put AWS access keys in application configuration. Local development may use the standard AWS profile, while ECS should use a task role.
The ECS Task Role must allow `s3:PutObject` and `s3:GetObject` for the private documents bucket object prefix.


### Inbound Case email configuration

Inbound AWS infrastructure is managed manually in the AWS Console. This repository does not provision or deploy SES, S3, SQS, IAM, or ECS resources for inbound email.

The inbound worker requires these inbound-specific environment variables and fails at startup if any is missing:

- `AWS_REGION=eu-central-1`
- `INBOUND_EMAIL_DOMAIN=docs.voxistudio.com`
- `INBOUND_EMAIL_QUEUE_NAME=<the manually created inbound queue name>`
- `INBOUND_EMAIL_RAW_BUCKET_NAME=<the manually created raw-email bucket name>`

There is deliberately no fallback from `INBOUND_EMAIL_RAW_BUCKET_NAME` to the canonical document bucket. Existing shared worker dependencies remain required, including `DOCUMENTS_BUCKET_NAME`, database configuration, and the canonical document-processing configuration.

Before starting the worker, manually configure one SES receipt rule for `docs.voxistudio.com` to store raw MIME messages in the selected raw bucket. Configure that bucket's `s3:ObjectCreated:*` notification to send direct S3 event messages to the selected standard SQS queue. Use the same AWS region for SES, S3, SQS, and the worker.

The worker task role must allow `sqs:GetQueueUrl`, `sqs:ReceiveMessage`, and `sqs:DeleteMessage` on the exact inbound queue; `s3:GetObject` on the exact raw-email bucket/prefix; and `s3:PutObject` on the existing canonical document bucket's `businesses/*` prefix. The SQS resource policy must allow the raw bucket to call `sqs:SendMessage`, and the raw bucket policy must allow SES to call `s3:PutObject`. Continue using the AWS SDK default credential chain; do not configure access keys in application environment variables.

The worker ignores email bodies and validates every attachment against the canonical PDF/JPEG/PNG and size policy. For each attachment, it uses OpenAI Vision only to classify against the receiving case’s currently unoccupied requirement type/label candidates. A server-validated `HIGH` match is linked to that requirement and its schema before canonical S3 upload; ambiguous, unmatched, invalid, or unavailable classifications create an unassigned `EMAIL` Document. The existing canonical S3 worker remains the only stage that extracts schema field values, and unassigned documents stop at `NEEDS_REVIEW`.
