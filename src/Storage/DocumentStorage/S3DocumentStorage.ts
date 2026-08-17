import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CreateDocumentUploadUrlRequest, CreateDocumentViewUrlRequest, IDocumentStorage } from "./IDocumentStorage";

export type S3DocumentStorageConfig = { bucketName: string; region: string };

export class S3DocumentStorage implements IDocumentStorage {
  private readonly client: S3Client;
  constructor(private readonly config: S3DocumentStorageConfig, client?: S3Client) {
    this.client = client ?? new S3Client({ region: config.region });
  }
  async createUploadUrl(request: CreateDocumentUploadUrlRequest): Promise<string> {
    return getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.config.bucketName, Key: request.storageKey, ContentType: request.contentType
    }), { expiresIn: request.expiresInSeconds });
  }
  async createViewUrl(request: CreateDocumentViewUrlRequest): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: request.storageKey
    }), { expiresIn: request.expiresInSeconds });
  }
  async getDocument(storageKey: string): Promise<Uint8Array> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: storageKey
    }));
    if (!response.Body) throw new Error("S3 document body is missing");
    return response.Body.transformToByteArray();
  }
}

export function documentStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3DocumentStorageConfig {
  const bucketName = env.DOCUMENTS_BUCKET_NAME?.trim();
  const region = env.AWS_REGION?.trim();
  if (!bucketName || !region) throw new Error("DOCUMENTS_BUCKET_NAME and AWS_REGION are required");
  return { bucketName, region };
}

