import express from 'express';
import { RequestHandler } from 'express';
import { IDatabaseClient } from '../../dataClients/SqlClient/sqlInterface';
import { ILogger } from '../../logging/logger';
import { AdminCreateBusinessUserRequestDto, AdminCreateUserRequestDto, AdminResetUserPasswordRequestDto, AuthResponseDto, AuthUserDto, BusinessUserRoleDto, LogoutRequestDto, RefreshTokenRequestDto, RegisterBusinessUserRequestDto, LoginRequestDto, UpsertBusinessMembershipRequestDto } from '../../contracts';
import { hashPassword, verifyPassword } from "../../auth/password";
import { signJwt } from '../../auth/jwt';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, createOpaqueRefreshToken, createSessionFamilyId, expiresAtFromNow, hashRefreshToken } from '../../auth/session';
import { AuthenticatedRequest, requireAuth, requirePlatformAdmin } from '../authMiddleware';

export function getAuthRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger, publicEntrypointRateLimiter: RequestHandler) {
    app.post("/auth/register", publicEntrypointRateLimiter, async (req, res) => {
      try {
        const request = req.body as RegisterBusinessUserRequestDto;
        if (!request.email || !request.password || !request.business?.name || !request.business?.phone || !request.business?.email) {
          return res.status(400).json({ message: "email, password and business details are required" });
        }
    
        const user = await sql.registerBusinessOwner(
          request.email,
          hashPassword(request.password),
          request.displayName,
          request.business,
          "user"
        );
        const authResponse = await createAuthResponse(sql, user);
    
        logger.info("auth.register.succeeded", {
          userId: user.id,
          email: user.email,
          platformRole: user.platformRole,
          businessIds: user.businessIds
        });
    
        return res.status(201).json(authResponse);
      } catch (error) {
        logger.error("auth.register.failed", { error });
        return res.status(500).json({ message: "Failed to register user" });
      }
    });
    
    app.post("/auth/login", publicEntrypointRateLimiter, async (req, res) => {
      try {
        const request = req.body as LoginRequestDto;
        if (!request.email || !request.password) {
          return res.status(400).json({ message: "email and password are required" });
        }
    
        const user = await sql.getUserWithPasswordByEmail(request.email);
        if (!user || !verifyPassword(request.password, user.passwordHash)) {
          return res.status(401).json({ message: "Invalid email or password" });
        }
    
        const { passwordHash: _passwordHash, ...safeUser } = user;
        const authResponse = await createAuthResponse(sql, safeUser);
    
        logger.info("auth.login.succeeded", {
          userId: user.id,
          email: user.email,
          platformRole: user.platformRole,
          businessIds: user.businessIds
        });
    
        return res.status(200).json(authResponse);
      } catch (error) {
        logger.error("auth.login.failed", { error });
        return res.status(500).json({ message: "Failed to login" });
      }
    });

    app.post("/auth/refresh", async (req, res) => {
      try {
        const request = req.body as Partial<RefreshTokenRequestDto>;
        if (!request.refreshToken) return res.status(400).json({ message: "refreshToken is required" });

        const replacementToken = createOpaqueRefreshToken();
        const refreshTokenExpiresAt = expiresAtFromNow(REFRESH_TOKEN_TTL_SECONDS);
        const user = await sql.rotateRefreshSession(
          hashRefreshToken(request.refreshToken),
          hashRefreshToken(replacementToken),
          refreshTokenExpiresAt
        );
        if (!user) return res.status(401).json({ message: "Invalid or expired refresh token" });

        return res.status(200).json(createAuthResponseWithToken(user, replacementToken, refreshTokenExpiresAt));
      } catch (error) {
        logger.error("auth.refresh.failed", { error });
        return res.status(500).json({ message: "Failed to refresh session" });
      }
    });

    app.post("/auth/logout", async (req, res) => {
      try {
        const request = req.body as Partial<LogoutRequestDto>;
        if (!request.refreshToken) return res.status(400).json({ message: "refreshToken is required" });
        await sql.revokeRefreshSession(hashRefreshToken(request.refreshToken));
        return res.status(204).send();
      } catch (error) {
        logger.error("auth.logout.failed", { error });
        return res.status(500).json({ message: "Failed to logout" });
      }
    });

    app.get("/me", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const user = await sql.getUserById(authReq.auth.userId);
        return user ? res.status(200).json(user) : res.status(404).json({ message: "User not found" });
      } catch (error) {
        logger.error("auth.me.fetch.failed", { error });
        return res.status(500).json({ message: "Failed to fetch current user" });
      }
    });

    app.get("/admin/users", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!requirePlatformAdmin(authReq, res)) {
          return;
        }

        const users = await sql.getAllUsers();
        logger.info("admin.users.list.succeeded", {
          userId: authReq.auth.userId,
          count: users.length
        });

        return res.status(200).json(users);
      } catch (error) {
        logger.error("admin.users.list.failed", { error });
        return res.status(500).json({ message: "Failed to fetch users" });
      }
    });

    app.post("/admin/users", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!requirePlatformAdmin(authReq, res)) return;
        const request = req.body as Partial<AdminCreateUserRequestDto>;
        if (!request.email?.trim() || !request.password || !isValidPlatformRole(request.platformRole) ||
            !isValidMemberships(request.businessMemberships)) {
          return res.status(400).json({ message: "Invalid user request" });
        }
        const user = await sql.createAppUser({
          email: request.email.trim(),
          passwordHash: hashPassword(request.password),
          displayName: request.displayName,
          platformRole: request.platformRole || "user",
          businessMemberships: request.businessMemberships || []
        });
        return res.status(201).json(user);
      } catch (error) {
        logger.error("admin.user.create.failed", { error });
        return res.status(500).json({ message: "Failed to create user" });
      }
    });

    app.post("/admin/businesses/:businessId/users", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!requirePlatformAdmin(authReq, res)) return;

        const businessId = Number(req.params.businessId);
        const request = req.body as Partial<AdminCreateBusinessUserRequestDto>;
        if (!isPositiveId(businessId) || !request.email?.trim() || !request.password || !isValidBusinessRole(request.role)) {
          return res.status(400).json({ message: "businessId, email, password and a valid role are required" });
        }

        if (!(await sql.getBusiness(businessId))) {
          return res.status(404).json({ message: "Business not found" });
        }

        const user = await sql.createAppUser({
          email: request.email.trim(),
          passwordHash: hashPassword(request.password),
          displayName: request.displayName,
          platformRole: "user",
          businessMemberships: [{ businessId, role: request.role }]
        });
        logger.info("admin.business_user.create.succeeded", {
          adminUserId: authReq.auth.userId,
          userId: user.id,
          businessId,
          role: request.role
        });
        return res.status(201).json(user);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return res.status(409).json({ message: "A user with this email already exists" });
        }
        logger.error("admin.business_user.create.failed", { error });
        return res.status(500).json({ message: "Failed to create business user" });
      }
    });

    app.put("/admin/users/:userId/businesses/:businessId", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!requirePlatformAdmin(authReq, res)) return;
        const userId = Number(req.params.userId);
        const businessId = Number(req.params.businessId);
        const request = req.body as UpsertBusinessMembershipRequestDto;
        const role = request.role || "owner";
        if (!isPositiveId(userId) || !isPositiveId(businessId) || !isValidBusinessRole(role)) {
          return res.status(400).json({ message: "Invalid membership request" });
        }
        const user = await sql.upsertBusinessMembership(userId, businessId, role);
        return user ? res.status(200).json(user) : res.status(404).json({ message: "User or business not found" });
      } catch (error) {
        logger.error("admin.membership.upsert.failed", { error });
        return res.status(500).json({ message: "Failed to assign business" });
      }
    });

    app.delete("/admin/users/:userId/businesses/:businessId", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!requirePlatformAdmin(authReq, res)) return;
        const userId = Number(req.params.userId);
        const businessId = Number(req.params.businessId);
        if (!isPositiveId(userId) || !isPositiveId(businessId)) return res.status(400).json({ message: "Invalid userId or businessId" });
        const deleted = await sql.deleteBusinessMembership(userId, businessId);
        return deleted ? res.status(204).send() : res.status(404).json({ message: "Membership not found" });
      } catch (error) {
        logger.error("admin.membership.delete.failed", { error });
        return res.status(500).json({ message: "Failed to remove business assignment" });
      }
    });

    app.patch("/admin/users/:userId/password", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!requirePlatformAdmin(authReq, res)) {
          return;
        }

        const userId = Number(req.params.userId);
        const request = req.body as AdminResetUserPasswordRequestDto;
        if (!Number.isFinite(userId) || !request.password) {
          return res.status(400).json({ message: "userId and password are required" });
        }

        const user = await sql.updateUserPassword(userId, hashPassword(request.password));
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        logger.info("admin.user.password.updated", {
          adminUserId: authReq.auth.userId,
          targetUserId: user.id
        });

        return res.status(200).json(user);
      } catch (error) {
        logger.error("admin.user.password.update.failed", { error });
        return res.status(500).json({ message: "Failed to update user password" });
      }
    });
}

function isValidPlatformRole(role: unknown): boolean {
  return role === undefined || role === "admin" || role === "user";
}

function isValidBusinessRole(role: unknown): role is BusinessUserRoleDto {
  return role === "owner" || role === "member";
}

function isValidMemberships(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((membership) =>
    isPositiveId(membership?.businessId) && isValidBusinessRole(membership?.role)));
}

function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function createAuthResponse(sql: IDatabaseClient, user: AuthUserDto): Promise<AuthResponseDto> {
  const refreshToken = createOpaqueRefreshToken();
  const refreshTokenExpiresAt = expiresAtFromNow(REFRESH_TOKEN_TTL_SECONDS);
  await sql.createRefreshSession(
    user.id,
    hashRefreshToken(refreshToken),
    createSessionFamilyId(),
    refreshTokenExpiresAt
  );
  return createAuthResponseWithToken(user, refreshToken, refreshTokenExpiresAt);
}

function createAuthResponseWithToken(user: AuthUserDto, refreshToken: string, refreshTokenExpiresAt: Date): AuthResponseDto {
  const accessTokenExpiresAt = expiresAtFromNow(ACCESS_TOKEN_TTL_SECONDS);
  const token = signJwt({
    userId: user.id,
    email: user.email,
    platformRole: user.platformRole,
    businessIds: user.businessIds,
    businessMemberships: user.businessMemberships
  }, undefined, ACCESS_TOKEN_TTL_SECONDS);
  return {
    token,
    accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    user
  };
}
