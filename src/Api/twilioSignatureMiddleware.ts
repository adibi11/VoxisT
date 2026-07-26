import crypto from "crypto";
import express from "express";
import { ILogger } from "../logging/logger";

export type TwilioSignatureConfig = {
  authToken: string;
  // Public origin Twilio was configured to call, e.g. "https://api.voxistudio.com".
  // The signature covers the exact URL Twilio requested, so behind a proxy the
  // reconstructed host/proto must match what Twilio sees - pinning the origin
  // via env is the reliable option.
  publicBaseUrl: string | null;
  enforced: boolean;
};

export function getTwilioSignatureConfig(): TwilioSignatureConfig {
  return {
    authToken: process.env.TWILIO_AUTH_TOKEN?.trim() || "",
    publicBaseUrl: normalizeBaseUrl(process.env.TWILIO_WEBHOOK_BASE_URL),
    enforced: (process.env.TWILIO_VALIDATE_SIGNATURE || "true").trim().toLowerCase() !== "false"
  };
}

export type TwilioSignatureCheck =
  | { ok: true }
  | { ok: false; reason: "misconfigured" | "signature_missing" | "signature_invalid" };

// Validates a request against the auth token of the (sub)account that owns the
// receiving number. Pass authToken resolved from the business's channel
// credentials; the env-level token is only a fallback for legacy setups.
export function validateTwilioRequest(
  config: TwilioSignatureConfig,
  logger: ILogger,
  req: express.Request,
  authToken?: string | null
): TwilioSignatureCheck {
  if (!config.enforced) {
    logger.warn("twilio.signature.validation.disabled", { path: req.originalUrl });
    return { ok: true };
  }

  const effectiveToken = authToken?.trim() || config.authToken;
  if (!effectiveToken) {
    logger.error("twilio.signature.validation.misconfigured", {
      reason: "no channel auth token and TWILIO_AUTH_TOKEN missing while TWILIO_VALIDATE_SIGNATURE is enabled"
    });
    return { ok: false, reason: "misconfigured" };
  }

  const signature = req.header("X-Twilio-Signature");
  if (!signature) {
    logger.warn("twilio.signature.missing", { path: req.originalUrl });
    return { ok: false, reason: "signature_missing" };
  }

  const url = buildRequestUrl(req, config.publicBaseUrl);
  const expected = computeTwilioSignature(effectiveToken, url, req.body);

  if (!timingSafeEqual(signature, expected)) {
    logger.warn("twilio.signature.invalid", { path: req.originalUrl, url });
    return { ok: false, reason: "signature_invalid" };
  }

  return { ok: true };
}

// Twilio signs: full request URL + POST params concatenated as key+value in
// alphabetical key order, HMAC-SHA1 with the account auth token, base64.
export function computeTwilioSignature(
  authToken: string,
  url: string,
  body: unknown
): string {
  let data = url;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const params = body as Record<string, unknown>;
    for (const key of Object.keys(params).sort()) {
      data += key + String(params[key] ?? "");
    }
  }

  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

function buildRequestUrl(req: express.Request, publicBaseUrl: string | null): string {
  if (publicBaseUrl) {
    return publicBaseUrl + req.originalUrl;
  }

  return `${req.protocol}://${req.get("host")}${req.originalUrl}`;
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : null;
}
