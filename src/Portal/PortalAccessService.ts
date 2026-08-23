import { createHash, randomBytes } from "crypto";
import {
  CreatePortalAccessResult,
  ICasePortalAccessRepository,
  ResolvedPortalAccess,
  RevokePortalAccessResult
} from "../dataClients/SqlClient/Repositories/CasePortalAccessRepo/ICasePortalAccessRepository";

export const DEFAULT_PORTAL_ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;
export const PORTAL_ACCESS_TOKEN_BYTES = 32;

export type CreatedPortalAccess = { accessToken: string; expiresAt: Date };

export class PortalAccessService {
  constructor(
    private readonly repository: ICasePortalAccessRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly tokenFactory: () => string = () => randomBytes(PORTAL_ACCESS_TOKEN_BYTES).toString("base64url")
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
      expiresAt,
      now
    );
    return result.outcome === "created" ? { accessToken, expiresAt: result.access.expiresAt } : null;
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
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_PORTAL_ACCESS_TTL_SECONDS;
}
