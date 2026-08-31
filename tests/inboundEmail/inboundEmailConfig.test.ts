import { describe, expect, it } from "vitest";
import { inboundEmailConfigFromEnv } from "../../src/InboundEmail/InboundEmailConfig";

const complete = {
  AWS_REGION: "eu-central-1",
  INBOUND_EMAIL_DOMAIN: "docs.voxistudio.com",
  INBOUND_EMAIL_QUEUE_NAME: "VoxisInboundEmail",
  INBOUND_EMAIL_RAW_BUCKET_NAME: "voxist-raw-email-production"
};

describe("inboundEmailConfigFromEnv", () => {
  it("uses only the four explicit inbound settings", () => {
    expect(inboundEmailConfigFromEnv({ ...complete, DOCUMENTS_BUCKET_NAME: "canonical-documents" })).toEqual({
      region: "eu-central-1", domain: "docs.voxistudio.com", queueName: "VoxisInboundEmail", rawBucketName: "voxist-raw-email-production"
    });
  });
  it.each(["AWS_REGION", "INBOUND_EMAIL_DOMAIN", "INBOUND_EMAIL_QUEUE_NAME", "INBOUND_EMAIL_RAW_BUCKET_NAME"] as const)(
    "fails clearly when %s is missing", (name) => {
      const env = { ...complete };
      delete env[name];
      expect(() => inboundEmailConfigFromEnv(env)).toThrow(`${name} is required for inbound email`);
    }
  );
  it("does not fall back to DOCUMENTS_BUCKET_NAME for raw email", () => {
    const { INBOUND_EMAIL_RAW_BUCKET_NAME: _removed, ...env } = complete;
    expect(() => inboundEmailConfigFromEnv({ ...env, DOCUMENTS_BUCKET_NAME: "canonical-documents" })).toThrow("INBOUND_EMAIL_RAW_BUCKET_NAME is required for inbound email");
  });
});
