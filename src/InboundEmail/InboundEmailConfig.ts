export type InboundEmailConfig = {
  domain: string;
  queueName: string;
  rawBucketName: string;
  region: string;
};

export function inboundEmailDomainFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return requiredInboundEnv(env, "INBOUND_EMAIL_DOMAIN").toLowerCase();
}

export function inboundEmailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): InboundEmailConfig {
  return {
    domain: inboundEmailDomainFromEnv(env),
    queueName: requiredInboundEnv(env, "INBOUND_EMAIL_QUEUE_NAME"),
    rawBucketName: requiredInboundEnv(env, "INBOUND_EMAIL_RAW_BUCKET_NAME"),
    region: requiredInboundEnv(env, "AWS_REGION")
  };
}

function requiredInboundEnv(env: NodeJS.ProcessEnv, name: "INBOUND_EMAIL_DOMAIN" | "INBOUND_EMAIL_QUEUE_NAME" | "INBOUND_EMAIL_RAW_BUCKET_NAME" | "AWS_REGION"): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for inbound email`);
  return value;
}
