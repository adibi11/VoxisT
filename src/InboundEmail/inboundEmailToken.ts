import { randomBytes } from "crypto";

export const INBOUND_EMAIL_TOKEN_BYTES = 8;
export const INBOUND_EMAIL_TOKEN_HEX_LENGTH = INBOUND_EMAIL_TOKEN_BYTES * 2;
export const LEGACY_INBOUND_EMAIL_TOKEN_HEX_LENGTH = 64;

export function generateInboundEmailToken(): string {
  return randomBytes(INBOUND_EMAIL_TOKEN_BYTES).toString("hex");
}

export function inboundEmailTokenPattern(): string {
  return `(?:[a-f0-9]{${INBOUND_EMAIL_TOKEN_HEX_LENGTH}}|[a-f0-9]{${LEGACY_INBOUND_EMAIL_TOKEN_HEX_LENGTH}})`;
}
