import { PrismaClient } from "../../generated/prisma/client";
import {
  AdminCreateBusinessRequestDto,
  AdminCreateUserRequestDto,
  AuthUserDto,
  BusinessMemberDto,
  BusinessSummaryDto,
  BusinessUserRoleDto,
  PlatformRoleDto
} from "../../contracts";
import { ILogger, logger } from "../../logging/logger";
import { BusinessDto } from "../Types/apiTypes";
import { BusinessChannelRepository } from "./Repositories/BusinessChannelRepo/BusinessChannelRepository";
import { IBusinessChannelRepository } from "./Repositories/BusinessChannelRepo/IBusinessChannelRepository";
import { CaseFollowUpRepository } from "./Repositories/CaseFollowUpRepo/CaseFollowUpRepository";
import { ICaseFollowUpRepository } from "./Repositories/CaseFollowUpRepo/ICaseFollowUpRepository";
import { CasePortalAccessRepository } from "./Repositories/CasePortalAccessRepo/CasePortalAccessRepository";
import { ICasePortalAccessRepository } from "./Repositories/CasePortalAccessRepo/ICasePortalAccessRepository";
import { CaseRepository } from "./Repositories/CaseRepo/CaseRepository";
import { ICaseRepository } from "./Repositories/CaseRepo/ICaseRepository";
import { DocumentBundleRepository } from "./Repositories/DocumentBundleRepo/DocumentBundleRepository";
import { IDocumentBundleRepository } from "./Repositories/DocumentBundleRepo/IDocumentBundleRepository";
import { DocumentRepository } from "./Repositories/DocumentRepo/DocumentRepository";
import { IDocumentRepository } from "./Repositories/DocumentRepo/IDocumentRepository";
import { InboundEmailRepository } from "./Repositories/InboundEmailRepo/InboundEmailRepository";
import { IInboundEmailRepository } from "./Repositories/InboundEmailRepo/IInboundEmailRepository";
import { IntegrationConnectionRepository } from "./Repositories/IntegrationConnectionRepo/IntegrationConnectionRepository";
import { IIntegrationConnectionRepository } from "./Repositories/IntegrationConnectionRepo/IIntegrationConnectionRepository";
import { LeadRepository } from "./Repositories/LeadRepo/LeadRepository";
import { ILeadRepository } from "./Repositories/LeadRepo/ILeadRepository";
import { SchemaRepository } from "./Repositories/SchemaRepo/SchemaRepository";
import { ISchemaRepository } from "./Repositories/SchemaRepo/ISchemaRepository";
import { IDatabaseClient } from "./sqlInterface";
import { VoiceConfigurationRepository } from "../../Voice/State/VoiceConfigurationRepository";
import { VoiceInteractionRepository } from "../../Voice/State/VoiceInteractionRepository";

export const prisma = new PrismaClient();

const userInclude = {
  businesses: { select: { businessId: true, role: true } }
} as const;

export class SqlManager implements IDatabaseClient {
  readonly leadRepository: ILeadRepository;
  readonly businessChannelRepository: IBusinessChannelRepository;
  readonly integrationConnectionRepository: IIntegrationConnectionRepository;
  readonly schemaRepository: ISchemaRepository;
  readonly caseRepository: ICaseRepository;
  readonly casePortalAccessRepository: ICasePortalAccessRepository;
  readonly caseFollowUpRepository: ICaseFollowUpRepository;
  readonly documentBundleRepository: IDocumentBundleRepository;
  readonly documentRepository: IDocumentRepository;
  readonly inboundEmailRepository: IInboundEmailRepository;
  readonly voiceConfigurationRepository: VoiceConfigurationRepository;
  readonly voiceInteractionRepository: VoiceInteractionRepository;

  constructor(
    private readonly sqlLogger: ILogger = logger.child({ component: "SqlManager" }),
    private readonly client: PrismaClient = prisma
  ) {
    this.leadRepository = new LeadRepository(client);
    this.businessChannelRepository = new BusinessChannelRepository(client);
    this.integrationConnectionRepository = new IntegrationConnectionRepository(client);
    this.schemaRepository = new SchemaRepository(client);
    this.caseRepository = new CaseRepository(client);
    this.casePortalAccessRepository = new CasePortalAccessRepository(client);
    this.caseFollowUpRepository = new CaseFollowUpRepository(client);
    this.documentBundleRepository = new DocumentBundleRepository(client);
    this.documentRepository = new DocumentRepository(client);
    this.inboundEmailRepository = new InboundEmailRepository(client);
    this.voiceConfigurationRepository = new VoiceConfigurationRepository(client);
    this.voiceInteractionRepository = new VoiceInteractionRepository(client);
  }

  getPrismaClient(): PrismaClient {
    return this.client;
  }

  async getBusiness(businessId: number): Promise<BusinessDto | null> {
    const business = await this.client.business.findUnique({ where: { id: businessId } });
    return business ? {
      name: business.businessName,
      phone: business.businessPhone,
      email: business.businessEmail,
      language: business.language
    } : null;
  }

  async registerBusinessOwner(
    email: string,
    passwordHash: string,
    displayName: string | undefined,
    businessDto: BusinessDto,
    platformRole: PlatformRoleDto = "user"
  ): Promise<AuthUserDto> {
    const user = await this.client.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          businessName: businessDto.name,
          businessPhone: businessDto.phone,
          businessEmail: businessDto.email,
          language: businessDto.language || "en"
        }
      });
      return tx.appUser.create({
        data: {
          email: email.trim().toLowerCase(),
          passwordHash,
          displayName,
          platformRole,
          businesses: { create: { businessId: business.id, role: "owner" } }
        },
        include: userInclude
      });
    });
    return mapAppUser(user);
  }

  async getUserWithPasswordByEmail(email: string): Promise<(AuthUserDto & { passwordHash: string }) | null> {
    const user = await this.client.appUser.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: userInclude
    });
    return user ? { ...mapAppUser(user), passwordHash: user.passwordHash } : null;
  }

  async getUserById(userId: number): Promise<AuthUserDto | null> {
    const user = await this.client.appUser.findUnique({ where: { id: userId }, include: userInclude });
    return user ? mapAppUser(user) : null;
  }

  async createRefreshSession(userId: number, tokenHash: string, familyId: string, expiresAt: Date): Promise<void> {
    await this.client.refreshSession.create({ data: { userId, tokenHash, familyId, expiresAt } });
  }

  async rotateRefreshSession(
    tokenHash: string,
    replacementHash: string,
    replacementExpiresAt: Date
  ): Promise<AuthUserDto | null> {
    return this.client.$transaction(async (tx) => {
      const session = await tx.refreshSession.findUnique({ where: { tokenHash } });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
      const replaced = await tx.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedByHash: replacementHash }
      });
      if (replaced.count !== 1) return null;
      await tx.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: replacementHash,
          familyId: session.familyId,
          expiresAt: replacementExpiresAt
        }
      });
      const user = await tx.appUser.findUnique({ where: { id: session.userId }, include: userInclude });
      return user ? mapAppUser(user) : null;
    });
  }

  async revokeRefreshSession(tokenHash: string): Promise<boolean> {
    const result = await this.client.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return result.count === 1;
  }

  async getAllUsers(): Promise<AuthUserDto[]> {
    return (await this.client.appUser.findMany({ include: userInclude, orderBy: { createdAt: "asc" } }))
      .map(mapAppUser);
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<AuthUserDto | null> {
    const result = await this.client.appUser.updateMany({ where: { id: userId }, data: { passwordHash } });
    if (result.count !== 1) return null;
    await this.client.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return this.getUserById(userId);
  }

  async createAppUser(
    request: Omit<AdminCreateUserRequestDto, "password"> & { passwordHash: string }
  ): Promise<AuthUserDto> {
    const user = await this.client.appUser.create({
      data: {
        email: request.email.trim().toLowerCase(),
        passwordHash: request.passwordHash,
        displayName: request.displayName,
        platformRole: request.platformRole || "user",
        businesses: request.businessMemberships?.length ? {
          create: request.businessMemberships.map((membership) => ({
            businessId: membership.businessId,
            role: membership.role
          }))
        } : undefined
      },
      include: userInclude
    });
    return mapAppUser(user);
  }

  async upsertBusinessMembership(
    userId: number,
    businessId: number,
    role: BusinessUserRoleDto
  ): Promise<AuthUserDto | null> {
    const [user, business] = await Promise.all([
      this.client.appUser.findUnique({ where: { id: userId }, select: { id: true } }),
      this.client.business.findUnique({ where: { id: businessId }, select: { id: true } })
    ]);
    if (!user || !business) return null;
    await this.client.businessUser.upsert({
      where: { userId_businessId: { userId, businessId } },
      create: { userId, businessId, role },
      update: { role }
    });
    return this.getUserById(userId);
  }

  async deleteBusinessMembership(userId: number, businessId: number): Promise<boolean> {
    const result = await this.client.businessUser.deleteMany({ where: { userId, businessId } });
    return result.count === 1;
  }

  async getBusinessMembers(businessId: number): Promise<BusinessMemberDto[]> {
    const memberships = await this.client.businessUser.findMany({
      where: { businessId },
      include: { user: true },
      orderBy: { createdAt: "asc" }
    });
    return memberships.map(({ user, role, createdAt }) => ({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      role: normalizeBusinessRole(role),
      createdAt: createdAt.toISOString()
    }));
  }

  async isBusinessMember(userId: number, businessId: number): Promise<boolean> {
    return Boolean(await this.client.businessUser.findUnique({
      where: { userId_businessId: { userId, businessId } },
      select: { id: true }
    }));
  }

  async getBusinessesForUser(userId: number): Promise<BusinessSummaryDto[]> {
    const memberships = await this.client.businessUser.findMany({
      where: { userId },
      include: { business: true },
      orderBy: { createdAt: "asc" }
    });
    return memberships.map(({ business }) => mapBusinessSummary(business));
  }

  async getAllBusinesses(): Promise<BusinessSummaryDto[]> {
    return (await this.client.business.findMany({ orderBy: { id: "asc" } })).map(mapBusinessSummary);
  }

  async createBusiness(request: AdminCreateBusinessRequestDto): Promise<BusinessSummaryDto> {
    return mapBusinessSummary(await this.client.business.create({
      data: {
        businessName: request.name.trim(),
        businessPhone: request.phone.trim(),
        businessEmail: request.email.trim(),
        language: request.language?.trim() || "en"
      }
    }));
  }
}

function mapAppUser(user: {
  id: number;
  email: string;
  displayName: string | null;
  platformRole: string;
  businesses: Array<{ businessId: number; role: string }>;
}): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    platformRole: user.platformRole === "admin" ? "admin" : "user",
    businessIds: user.businesses.map((membership) => membership.businessId),
    businessMemberships: user.businesses.map((membership) => ({
      businessId: membership.businessId,
      role: normalizeBusinessRole(membership.role)
    }))
  };
}

function normalizeBusinessRole(role: string): BusinessUserRoleDto {
  return role === "owner" ? "owner" : "member";
}

function mapBusinessSummary(business: {
  id: number;
  businessName: string;
  businessPhone: string;
  businessEmail: string;
}): BusinessSummaryDto {
  return {
    id: business.id,
    name: business.businessName,
    phone: business.businessPhone,
    email: business.businessEmail
  };
}
