import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBodyParserErrorHandler, getHttpSecurityConfig } from "../../src/Api/securityMiddleware";

describe("HTTP security configuration", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    vi.stubEnv("HTTP_JSON_BODY_LIMIT", "");
    vi.stubEnv("HTTP_FORM_BODY_LIMIT", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to one trusted proxy hop for ALB environments", () => {
    const config = getHttpSecurityConfig("staging");

    expect(config.trustProxyHops).toBe(1);
    expect(config.enableHsts).toBe(true);
    expect(config.jsonBodyLimit).toBe("100kb");
    expect(config.formBodyLimit).toBe("100kb");
  });

  it("does not trust forwarded headers for direct local development by default", () => {
    const config = getHttpSecurityConfig("development");

    expect(config.trustProxyHops).toBe(0);
    expect(config.enableHsts).toBe(false);
  });
});

describe("body parser errors", () => {
  it("returns 413 without logging the request body", () => {
    const logger = { warn: vi.fn() } as any;
    const handler = createBodyParserErrorHandler(logger);
    const response = createResponse();

    handler(
      { status: 413, type: "entity.too.large" },
      { method: "POST", originalUrl: "/v1/auth/login", headers: { "content-type": "application/json", "content-length": "999999" } } as any,
      response as any,
      vi.fn()
    );

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({ message: "Request body is too large" });
    expect(logger.warn).toHaveBeenCalledWith("http.request.body.too_large", expect.not.objectContaining({ body: expect.anything() }));
  });

  it("returns 400 for malformed JSON", () => {
    const logger = { warn: vi.fn() } as any;
    const handler = createBodyParserErrorHandler(logger);
    const response = createResponse();

    handler(
      { status: 400, type: "entity.parse.failed" },
      { method: "POST", originalUrl: "/v1/auth/login", headers: { "content-type": "application/json" } } as any,
      response as any,
      vi.fn()
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ message: "Invalid request body" });
  });
});

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn()
  };
  response.status.mockReturnValue(response);
  return response;
}
