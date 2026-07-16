import { createHmac } from "crypto";
import { RequestHandler } from "express";
import { redisClient } from "../dataClients/CacheClient/redis";
import { ILogger } from "../logging/logger";


//Use constant script to ensure atomicity of increment and expire operations in Redis. This is a Lua script that will be executed on the Redis server.
// It increments the counter for the given key and sets an expiration time if it's the first increment. 
// It returns the current count and the remaining time to live (TTL) for the key.
const FIXED_WINDOW_INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { current, redis.call('PTTL', KEYS[1]) }
`;

export type PublicEntrypointRateLimitConfig = {
  maxRequests: number;
  windowSeconds: number;
  keySecret: string;
};

/**
 * This is one shared budget for the most exposed browser/public entrypoints.
 * Keeping it shared prevents a caller from bypassing the budget by rotating
 * between login, registration, and public-lead routes.
 */
export function getPublicEntrypointRateLimitConfig(
  environment = process.env.NODE_ENV || "development"
): PublicEntrypointRateLimitConfig {
  return {
    maxRequests: getPositiveInteger("PUBLIC_ENTRYPOINT_RATE_LIMIT_MAX", 20),
    windowSeconds: getPositiveInteger("PUBLIC_ENTRYPOINT_RATE_LIMIT_WINDOW_SECONDS", 15 * 60),
    keySecret: getRateLimitKeySecret(environment)
  };
}

export function createPublicEntrypointRateLimiter(
  config: PublicEntrypointRateLimitConfig,
  logger: ILogger
): RequestHandler {
  return async (req, res, next) => {
    // req.ip is the ALB-provided client address only because trust proxy is configured first.
    const identity = fingerprintIp(req.ip || req.socket.remoteAddress || "unknown", config.keySecret);
    const key = `rate-limit:v1:public-entrypoint:ip:${identity}`;

    try {
      const [count, ttlMilliseconds] = await incrementFixedWindow(key, config.windowSeconds * 1000);
      const retryAfterSeconds = Math.max(1, Math.ceil(ttlMilliseconds / 1000));
      const remaining = Math.max(0, config.maxRequests - count);

      res.setHeader("RateLimit-Limit", String(config.maxRequests));
      res.setHeader("RateLimit-Remaining", String(remaining));
      res.setHeader("RateLimit-Reset", String(retryAfterSeconds));

      if (count > config.maxRequests) {
        res.setHeader("Retry-After", String(retryAfterSeconds));
        logger.warn("rate_limit.rejected", {
          group: "public-entrypoint",
          identityType: "ip",
          retryAfterSeconds
        });
        return res.status(429).json({ message: "Too many requests. Please try again later." });
      }

      return next();
    } catch (error) {
      // This group protects unauthenticated entrypoints, so do not fail open if Redis is unavailable.
      logger.error("rate_limit.unavailable", {
        group: "public-entrypoint",
        identityType: "ip",
        error
      });
      return res.status(503).json({ message: "Service temporarily unavailable" });
    }
  };
}

export function fingerprintIp(ip: string, keySecret: string): string {
  return createHmac("sha256", keySecret).update(ip).digest("hex");
}

async function incrementFixedWindow(key: string, windowMilliseconds: number): Promise<[number, number]> {
  const result = await redisClient.eval(FIXED_WINDOW_INCREMENT_SCRIPT, 1, key, String(windowMilliseconds)) as unknown;
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error("Unexpected Redis rate-limit response");
  }

  const count = Number(result[0]);
  const ttlMilliseconds = Number(result[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttlMilliseconds) || ttlMilliseconds < 0) {
    throw new Error("Invalid Redis rate-limit response");
  }

  return [count, ttlMilliseconds];
}

function getPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function getRateLimitKeySecret(environment: string): string {
  const configured = process.env.RATE_LIMIT_KEY_SECRET?.trim();
  if (configured) return configured;

  if (environment === "production" || environment === "staging") {
    throw new Error("RATE_LIMIT_KEY_SECRET is required in staging and production");
  }

  // Local-only fallback keeps direct localhost development simple. It must never be used in deployment.
  return "local-development-rate-limit-key";
}
