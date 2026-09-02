import {
  AdminCreateBusinessRequestDto,
  AdminCreateUserRequestDto,
  AuthUserDto,
  BusinessMemberDto,
  BusinessSummaryDto,
  BusinessUserRoleDto,
  PlatformRoleDto
} from "../../contracts";
import { BusinessDto } from "../Types/apiTypes";
import { PrismaClient } from "../../generated/prisma/client";
import { IBusinessChannelRepository } from "./Repositories/BusinessChannelRepo/IBusinessChannelRepository";
import { ICaseFollowUpRepository } from "./Repositories/CaseFollowUpRepo/ICaseFollowUpRepository";
import { ICasePortalAccessRepository } from "./Repositories/CasePortalAccessRepo/ICasePortalAccessRepository";
import { ICaseRepository } from "./Repositories/CaseRepo/ICaseRepository";
import { IDocumentBundleRepository } from "./Repositories/DocumentBundleRepo/IDocumentBundleRepository";
import { IDocumentRepository } from "./Repositories/DocumentRepo/IDocumentRepository";
import { IInboundEmailRepository } from "./Repositories/InboundEmailRepo/IInboundEmailRepository";
import { IIntegrationConnectionRepository } from "./Repositories/IntegrationConnectionRepo/IIntegrationConnectionRepository";
import { ILeadRepository } from "./Repositories/LeadRepo/ILeadRepository";
import { ISchemaRepository } from "./Repositories/SchemaRepo/ISchemaRepository";
import { IVoiceConfigurationRepository } from "../../Voice/State/VoiceConfigurationRepository";
import { VoiceInteractionRepository } from "../../Voice/State/VoiceInteractionRepository";

export interface IDatabaseClient {
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
  readonly voiceConfigurationRepository: IVoiceConfigurationRepository;
  readonly voiceInteractionRepository: VoiceInteractionRepository;

  getPrismaClient(): PrismaClient;

  getBusiness(businessId: number): Promise<BusinessDto | null>;
  registerBusinessOwner(
    email: string,
    passwordHash: string,
    displayName: string | undefined,
    businessDto: BusinessDto,
    platformRole?: PlatformRoleDto
  ): Promise<AuthUserDto>;
  getUserWithPasswordByEmail(email: string): Promise<(AuthUserDto & { passwordHash: string }) | null>;
  getUserById(userId: number): Promise<AuthUserDto | null>;
  createRefreshSession(userId: number, tokenHash: string, familyId: string, expiresAt: Date): Promise<void>;
  rotateRefreshSession(tokenHash: string, replacementHash: string, replacementExpiresAt: Date): Promise<AuthUserDto | null>;
  revokeRefreshSession(tokenHash: string): Promise<boolean>;
  getAllUsers(): Promise<AuthUserDto[]>;
  updateUserPassword(userId: number, passwordHash: string): Promise<AuthUserDto | null>;
  createAppUser(request: Omit<AdminCreateUserRequestDto, "password"> & { passwordHash: string }): Promise<AuthUserDto>;
  upsertBusinessMembership(userId: number, businessId: number, role: BusinessUserRoleDto): Promise<AuthUserDto | null>;
  deleteBusinessMembership(userId: number, businessId: number): Promise<boolean>;
  getBusinessMembers(businessId: number): Promise<BusinessMemberDto[]>;
  isBusinessMember(userId: number, businessId: number): Promise<boolean>;
  getBusinessesForUser(userId: number): Promise<BusinessSummaryDto[]>;
  getAllBusinesses(): Promise<BusinessSummaryDto[]>;
  createBusiness(request: AdminCreateBusinessRequestDto): Promise<BusinessSummaryDto>;
}
