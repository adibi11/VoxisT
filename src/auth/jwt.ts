import { createHmac, timingSafeEqual } from "crypto";
import { JwtClaimsDto } from "../contracts/authContracts";

type JwtPayload = JwtClaimsDto & {
  exp: number;
  iat: number;
};

const DEFAULT_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 15 * 60);

export function signJwt(claims: JwtClaimsDto, secret = getJwtSecret(), ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    ...claims,
    iat: now,
    exp: now + ttlSeconds
  });
  const signature = sign(`${header}.${payload}`, secret);

  return `${header}.${payload}.${signature}`;
}

export function verifyJwt(token: string, secret = getJwtSecret()): JwtClaimsDto {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    throw new Error("Invalid token format");
  }

  const expectedSignature = sign(`${header}.${payload}`, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Invalid token signature");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtPayload;
  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return {
    userId: parsed.userId,
    email: parsed.email,
    platformRole: parsed.platformRole || "user",
    businessIds: parsed.businessIds || [],
    businessMemberships: parsed.businessMemberships || []
  };
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return secret;
}
