import express from 'express';
import { IDatabaseClient } from '../../dataClients/SqlClient/sqlInterface';
import { ILogger } from '../../logging/logger';
import { RegisterBusinessUserRequestDto ,LoginRequestDto} from '../../contracts';
import { hashPassword, verifyPassword } from "../../auth/password";
import { signJwt } from '../../auth/jwt';

export function getAuthRoutes(app: express.Application, sql: IDatabaseClient, logger: ILogger) {
    app.post("/auth/register", async (req, res) => {
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
          isValidPlatformRole(request.platformRole) ? request.platformRole : "user"
        );
        const token = signJwt({
          userId: user.id,
          email: user.email,
          platformRole: user.platformRole,
          businessIds: user.businessIds,
          businessMemberships: user.businessMemberships
        });
    
        logger.info("auth.register.succeeded", {
          userId: user.id,
          email: user.email,
          platformRole: user.platformRole,
          businessIds: user.businessIds
        });
    
        return res.status(201).json({ token, user });
      } catch (error) {
        logger.error("auth.register.failed", { error });
        return res.status(500).json({ message: "Failed to register user" });
      }
    });
    
    app.post("/auth/login", async (req, res) => {
      try {
        const request = req.body as LoginRequestDto;
        if (!request.email || !request.password) {
          return res.status(400).json({ message: "email and password are required" });
        }
    
        const user = await sql.getUserWithPasswordByEmail(request.email);
        if (!user || !verifyPassword(request.password, user.passwordHash)) {
          return res.status(401).json({ message: "Invalid email or password" });
        }
    
        const token = signJwt({
          userId: user.id,
          email: user.email,
          platformRole: user.platformRole,
          businessIds: user.businessIds,
          businessMemberships: user.businessMemberships
        });
        const { passwordHash: _passwordHash, ...safeUser } = user;
    
        logger.info("auth.login.succeeded", {
          userId: user.id,
          email: user.email,
          platformRole: user.platformRole,
          businessIds: user.businessIds
        });
    
        return res.status(200).json({ token, user: safeUser });
      } catch (error) {
        logger.error("auth.login.failed", { error });
        return res.status(500).json({ message: "Failed to login" });
      }
    });
}

function isValidPlatformRole(role: unknown): role is "admin" | "user" {
  return role === "admin" || role === "user";
}
