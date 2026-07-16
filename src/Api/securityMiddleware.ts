import { ErrorRequestHandler, RequestHandler } from "express";
import { ILogger } from "../logging/logger";

const BODY_LIMIT_PATTERN = /^[1-9]\d*(?:b|kb|mb)$/i;

export type HttpSecurityConfig = {
  jsonBodyLimit: string;
  formBodyLimit: string;
  trustProxyHops: 0 | 1;
  enableHsts: boolean;
};

export function getHttpSecurityConfig(environment = process.env.NODE_ENV): HttpSecurityConfig {
  const jsonBodyLimit = getBodyLimit("HTTP_JSON_BODY_LIMIT", "100kb");
  const formBodyLimit = getBodyLimit("HTTP_FORM_BODY_LIMIT", "100kb");
  const trustProxyHops = getTrustProxyHops(environment);

  return {
    jsonBodyLimit,
    formBodyLimit,
    trustProxyHops,
    enableHsts: environment === "production" || environment === "staging"
  };
}

export function createSecurityHeaders(config: HttpSecurityConfig): RequestHandler {
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");

    // Access and refresh tokens must never be retained by browser or intermediary caches.
    if (req.path.startsWith("/v1/auth/") || req.path === "/v1/me") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
    }

    // TLS is terminated at the ALB in staging/production. HSTS tells browsers to keep using HTTPS.
    if (config.enableHsts) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  };
}

export function createBodyParserErrorHandler(logger: ILogger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    const parserError = error as { status?: unknown; type?: unknown } | undefined;
    const status = typeof parserError?.status === "number" ? parserError.status : undefined;

    if (status === 413 || parserError?.type === "entity.too.large") {
      logger.warn("http.request.body.too_large", {
        method: req.method,
        path: req.originalUrl,
        contentType: req.headers["content-type"],
        contentLength: req.headers["content-length"]
      });
      return res.status(413).json({ message: "Request body is too large" });
    }

    if (status === 400 || parserError?.type === "entity.parse.failed") {
      logger.warn("http.request.body.invalid", {
        method: req.method,
        path: req.originalUrl,
        contentType: req.headers["content-type"]
      });
      return res.status(400).json({ message: "Invalid request body" });
    }

    return next(error);
  };
}

function getBodyLimit(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!BODY_LIMIT_PATTERN.test(value)) {
    throw new Error(`${name} must be a positive byte limit such as 100kb or 1mb`);
  }
  return value;
}

function getTrustProxyHops(environment: string | undefined): 0 | 1 {
  const configured = process.env.TRUST_PROXY_HOPS?.trim();
  if (configured === undefined || configured === "") {
    // Direct localhost development must not trust spoofable forwarding headers by default.
    return environment === "production" || environment === "staging" ? 1 : 0;
  }

  if (configured === "0" || configured === "1") {
    return Number(configured) as 0 | 1;
  }

  throw new Error("TRUST_PROXY_HOPS must be 0 (direct connection) or 1 (ALB/ngrok)");
}
