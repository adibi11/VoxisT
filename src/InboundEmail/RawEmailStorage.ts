import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface IRawEmailStorage { getRawEmail(storageKey: string): Promise<Uint8Array>; }
export class S3RawEmailStorage implements IRawEmailStorage {
  private readonly client: S3Client;
  constructor(private readonly bucketName: string, region: string, client?: S3Client) { this.client = client ?? new S3Client({ region }); }
  async getRawEmail(storageKey: string): Promise<Uint8Array> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: storageKey }));
    if (!response.Body) throw new Error("Raw inbound email body is missing");
    return response.Body.transformToByteArray();
  }
}
