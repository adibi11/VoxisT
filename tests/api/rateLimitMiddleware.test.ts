import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/dataClients/CacheClient/redis", () => ({
  redisClient: {
    eval: vi.fn()
  }
}));

import { redisClient } from "../../src/dataClients/CacheClient/redis";
import { createPublicEntrypointRateLimiter, fingerprintIp, getPublicEntrypointRateLimitConfig } from "../../src/Api/rateLimitMiddleware";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public entrypoint rate-limit configuration", () => {
  it("uses the documented 20 requests per 15 minute default", () => {
    vi.stubEnv("PUBLIC_ENTRYPOINT_RATE_LIMIT_MAX", "");
    vi.stubEnv("PUBLIC_ENTRYPOINT_RATE_LIMIT_WINDOW_SECONDS", "");
    vi.stubEnv("RATE_LIMIT_KEY_SECRET", "test-secret");

    expect(getPublicEntrypointRateLimitConfig("development")).toMatchObject({
      maxRequests: 20,
      windowSeconds: 900
    });
  });

  it("requires a secret outside local development", () => {
    vi.stubEnv("RATE_LIMIT_KEY_SECRET", "");

    expect(() => getPublicEntrypointRateLimitConfig("staging")).toThrow("RATE_LIMIT_KEY_SECRET is required");
  });

  it("creates a stable keyed fingerprint without retaining the raw IP", () => {
    const fingerprint = fingerprintIp("203.0.113.10", "test-secret");

    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).not.toContain("203.0.113.10");
    expect(fingerprint).toBe(fingerprintIp("203.0.113.10", "test-secret"));
    expect(fingerprint).not.toBe(fingerprintIp("203.0.113.11", "test-secret"));
  });

  it("allows requests within the shared budget and rejects the next one", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() } as any;
    const limiter = createPublicEntrypointRateLimiter({
      maxRequests: 2,
      windowSeconds: 60,
      keySecret: "test-secret"
    }, logger);
    const evaluate = vi.mocked(redisClient.eval);
    evaluate.mockResolvedValueOnce([1, 60_000] as any);
    evaluate.mockResolvedValueOnce([2, 60_000] as any);
    evaluate.mockResolvedValueOnce([3, 60_000] as any);
    const next = vi.fn();

    await limiter(createRequest() as any, createResponse() as any, next);
    await limiter(createRequest() as any, createResponse() as any, next);
    const rejectedResponse = createResponse();
    await limiter(createRequest() as any, rejectedResponse as any, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(rejectedResponse.status).toHaveBeenCalledWith(429);
    expect(rejectedResponse.json).toHaveBeenCalledWith({ message: "Too many requests. Please try again later." });
    expect(evaluate.mock.calls[0][2]).not.toContain("203.0.113.10");
  });
});

function createRequest() {
  return {
    ip: "203.0.113.10",
    socket: { remoteAddress: "127.0.0.1" }
  };
}

function createResponse() {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn()
  };
  response.status.mockReturnValue(response);
  return response;
}
