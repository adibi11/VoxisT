import { createHash, randomBytes, timingSafeEqual } from "crypto";
import {
  CreatePortalAccessResult,
  ICasePortalAccessRepository,
  ResolvedPortalAccess,
  RevokePortalAccessResult
} from "../dataClients/SqlClient/Repositories/CasePortalAccessRepo/ICasePortalAccessRepository";
import { portalTokenCipher, PortalTokenCipher } from "./portalTokenEncryption";

export const DEFAULT_PORTAL_ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;
export const PORTAL_ACCESS_TOKEN_BYTES = 32;

export type CreatedPortalAccess = { accessToken: string; expiresAt: Date };
export type InternalPortalAccess = CreatedPortalAccess & { portalUrl: string | null };

export class PortalAccessService {
  constructor(
    private readonly repository: ICasePortalAccessRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly tokenFactory: () => string = () => randomBytes(PORTAL_ACCESS_TOKEN_BYTES).toString("base64url"),
    private readonly tokenCipher: PortalTokenCipher = portalTokenCipher
  ) {}

  async createAccess(businessId: number, caseId: number): Promise<CreatedPortalAccess | null> {
    const accessToken = this.tokenFactory();
    if (!isValidPortalToken(accessToken)) throw new Error("Portal token generator returned an invalid token");
    const now = this.now();
    const expiresAt = new Date(now.getTime() + portalAccessTtlSecondsFromEnv() * 1000);
    const result: CreatePortalAccessResult = await this.repository.createAccess(
      businessId,
      caseId,
      hashPortalAccessToken(accessToken),
      this.tokenCipher.encrypt(accessToken),
      expiresAt,
      now
    );
    return result.outcome === "created" ? { accessToken, expiresAt: result.access.expiresAt } : null;
  }

  async getOrCreateActiveAccess(businessId: number, caseId: number): Promise<InternalPortalAccess | null> {
    const current = await this.repository.findActiveAccessForCase(businessId, caseId, this.now());
    if (current.outcome === "case_not_found") return null;

    if (current.access?.tokenEncrypted) {
      const accessToken = this.tokenCipher.decrypt(current.access.tokenEncrypted);
      if (!isValidPortalToken(accessToken) || !hashesEqual(hashPortalAccessToken(accessToken), current.access.tokenHash)) {
        throw new Error("Stored portal token failed integrity validation");
      }
      return {
        accessToken,
        expiresAt: current.access.expiresAt,
        portalUrl: portalUrlFromEnv(accessToken)
      };
    }

    const created = await this.createAccess(businessId, caseId);
    return created ? { ...created, portalUrl: portalUrlFromEnv(created.accessToken) } : null;
  }

  async resolveAccess(accessToken: string): Promise<ResolvedPortalAccess | null> {
    if (!isValidPortalToken(accessToken)) return null;
    return this.repository.resolveActiveAccess(hashPortalAccessToken(accessToken), this.now());
  }

  async revokeAccess(businessId: number, caseId: number): Promise<RevokePortalAccessResult> {
    return this.repository.revokeAccess(businessId, caseId, this.now());
  }
}

export function hashPortalAccessToken(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex");
}

export function isValidPortalToken(accessToken: unknown): accessToken is string {
  return typeof accessToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(accessToken);
}

export function portalAccessTtlSecondsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.PORTAL_ACCESS_TTL_SECONDS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_PORTAL_ACCESS_TTL_SECONDS;
}

export function portalUrlFromEnv(accessToken: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const base = env.PORTAL_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  const parsed = new URL(base);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("PORTAL_BASE_URL must use HTTP or HTTPS");
  }
  return `${base}/c/${encodeURIComponent(accessToken)}`;
}

function hashesEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
