import { NextFunction, Request, Response } from "express";
import { JwtClaimsDto } from "../contracts/authContracts";
import { verifyJwt } from "../auth/jwt";

export type AuthenticatedRequest = Request & {
  auth: JwtClaimsDto;
};

// Express middleware that validates Bearer tokens and attaches claims to the request.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: "Missing bearer token" });
  }

  try {
    (req as AuthenticatedRequest).auth = verifyJwt(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid bearer token" });
  }
}

export function requireBusinessAccess(req: AuthenticatedRequest, res: Response, businessId: number): boolean {
  if (req.auth.platformRole === "admin") {
    return true;
  }

  if (!req.auth.businessIds.includes(businessId)) {
    res.status(403).json({ message: "Business access denied" });
    return false;
  }

  return true;
}

export function requirePlatformAdmin(req: AuthenticatedRequest, res: Response): boolean {
  if (req.auth.platformRole !== "admin") {
    res.status(403).json({ message: "Platform admin access required" });
    return false;
  }

  return true;
}

export function getBusinessRole(req: AuthenticatedRequest, businessId: number) {
  return req.auth.businessMemberships.find((membership) => membership.businessId === businessId)?.role ?? null;
}

export function requireBusinessOwner(req: AuthenticatedRequest, res: Response, businessId: number): boolean {
  if (req.auth.platformRole === "admin") return true;
  if (getBusinessRole(req, businessId) !== "owner") {
    res.status(403).json({ message: "Business owner access required" });
    return false;
  }
  return true;
}

function getBearerToken(authorization?: string): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}
