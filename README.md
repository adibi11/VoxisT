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
