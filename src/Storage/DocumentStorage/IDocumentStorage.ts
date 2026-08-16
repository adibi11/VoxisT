export type CreateDocumentUploadUrlRequest = {
  storageKey: string;
  contentType: string;
  expiresInSeconds: number;
};

export type CreateDocumentViewUrlRequest = {
  storageKey: string;
  expiresInSeconds: number;
};

export interface IDocumentStorage {
  createUploadUrl(request: CreateDocumentUploadUrlRequest): Promise<string>;
  createViewUrl(request: CreateDocumentViewUrlRequest): Promise<string>;
}

