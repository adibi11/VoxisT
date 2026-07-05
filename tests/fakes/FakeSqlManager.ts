import { IDatabaseClient } from "../../src/dataClients/SqlClient/sqlInterface";
import {
  AuthUserDto,
  BusinessSummaryDto,
  ClientSummaryDto,
  ConversationMessagesResponseDto,
  ConversationSummaryDto,
  CreateManualLeadRequestDto,
  LeadDto,
  LeadSourceDto,
  LeadStatusDto,
  LeadSummaryDto,
  PlatformRoleDto
} from "../../src/contracts";
import { BusinessActionDto, BusinessDto, CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { ensureClientNameParam } from "../../src/dataClients/Types/clientNameParam";
import { BusinessContext, Client, ConversationCacheState, ConversationEntity } from "../../src/dataClients/Types/messageTypes";
import { ConversationState } from "../../src/dataClients/Types/stateMachineTypes";
import { ILeadRepository } from "../../src/dataClients/SqlClient/Repositories/LeadRepo/ILeadRepository";

type SavedMessage = {
  conversationId: number;
  type: "user" | "bot";
  content: string;
};

type SavedParamAnswer = {
  clientId: number;
  conversationId: number;
  businessId: number;
  paramName: string;
  paramValue: string;
};

type SavedLead = {
  id: number;
  businessId: number;
  clientId?: number | null;
  memberId?: number | null;
  status: LeadStatusDto;
  source: LeadSourceDto;
  score?: number | null;
  summary?: string | null;
  notes?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedAt?: Date | null;
  followUpAt?: Date | null;
  closedAt?: Date | null;
};

export class FakeSqlManager implements IDatabaseClient {
  readonly leadRepository: ILeadRepository = this;

  public clientsByPhone = new Map<string, Client>();
  public conversations = new Map<number, { clientId: number; businessId: number; state: ConversationCacheState }>();
  public businesses = new Map<number, BusinessDto>();
  public businessContexts = new Map<number, BusinessContext>();
  public businessActions = new Map<number, BusinessActionDto>();
  public messages: SavedMessage[] = [];
  public paramAnswers: SavedParamAnswer[] = [];
  public leads = new Map<number, SavedLead>();
  public createdConversations: { clientId: number; businessId: number; content: string }[] = [];

  private nextClientId = 1;
  private nextConversationId = 1;
  private nextLeadId = 1;

  async getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null> {
    return this.getLatestConversationCacheState(clientId, businessId);
  }

  async getLatestConversationCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null> {
    const conversation = [...this.conversations.values()]
      .filter((item) => item.clientId === clientId && item.businessId === businessId)
      .sort((left, right) => right.state.updatedAt.getTime() - left.state.updatedAt.getTime())[0];

    return conversation ? this.hydrateState(conversation.state) : null;
  }

  async getCacheStateByConversationId(conversationId: number): Promise<ConversationCacheState | null> {
    const conversation = this.conversations.get(conversationId);
    return conversation ? this.hydrateState(conversation.state) : null;
  }

  async getConversationEntity(_clientId: number, _businessId: number): Promise<ConversationEntity> {
    throw new Error("FakeSqlManager.getConversationEntity is not implemented for current tests");
  }

  async createMessage(conversationId: number, type: "user" | "bot", content: string): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} does not exist`);
    }
    this.messages.push({ conversationId, type, content });
    conversation.state.updatedAt = new Date();
  }

  async createDbConversation(clientId: number, businessId: number, content: string): Promise<ConversationCacheState> {
    this.createdConversations.push({ clientId, businessId, content });
    const state = {
      conversationId: this.nextConversationId++,
      state: ConversationState.start,
      channel: CommunicationChannel.Whatsapp,
      provider: MessageProvider.Twilio,
      collectedParams: this.emptyParamsForBusiness(businessId),
      lastMessages: [],
      updatedAt: new Date(),
      phone: this.findClientPhone(clientId)
    };
    this.conversations.set(state.conversationId, { clientId, businessId, state });
    return this.cloneState(state);
  }

  async createDbBusiness(businessDto: BusinessDto): Promise<void> {
    const businessId = this.businesses.size + 1;
    this.businesses.set(businessId, businessDto);
  }

  async registerBusinessOwner(
    email: string,
    _passwordHash: string,
    displayName: string | undefined,
    businessDto: BusinessDto,
    platformRole: PlatformRoleDto = "user"
  ): Promise<AuthUserDto> {
    const businessId = this.businesses.size + 1;
    this.businesses.set(businessId, businessDto);
    return {
      id: this.nextClientId++,
      email,
      displayName,
      platformRole,
      businessIds: [businessId],
      businessMemberships: [{ businessId, role: "owner" }]
    };
  }

  async getUserWithPasswordByEmail(_email: string): Promise<(AuthUserDto & { passwordHash: string }) | null> {
    return null;
  }

  async getBusinessesForUser(_userId: number): Promise<BusinessSummaryDto[]> {
    return this.getAllBusinesses();
  }

  async getAllBusinesses(): Promise<BusinessSummaryDto[]> {
    return [...this.businesses.entries()].map(([id, business]) => ({
      id,
      name: business.name,
      phone: business.phone,
      email: business.email
    }));
  }

  async upsertBusiness(businessDto: BusinessDto, businessId: number): Promise<BusinessDto> {
    this.businesses.set(businessId, businessDto);
    return businessDto;
  }

  async upsertBusinessAction(businessId: number, actionDto: BusinessActionDto): Promise<void> {
    this.businessActions.set(businessId, { ...actionDto, businessId });
  }

  async getOrCreateClientByPhone(phoneNumber: string): Promise<Client> {
    const existing = this.clientsByPhone.get(phoneNumber);
    if (existing) {
      return existing;
    }

    const client: Client = {
      id: this.nextClientId++,
      name: "Fake Client",
      phone: phoneNumber,
      email: ""
    };
    this.clientsByPhone.set(phoneNumber, client);
    return client;
  }

  async updateClientName(clientId: number, name: string): Promise<void> {
    const client = [...this.clientsByPhone.values()].find((candidate) => candidate.id === clientId);
    if (client) {
      client.name = name;
    }
  }

  async upsertParamAnswer(
    clientId: number,
    conversationId: number,
    businessId: number,
    paramName: string,
    paramValue: string
  ): Promise<void> {
    const existing = this.paramAnswers.find(
      (answer) =>
        answer.clientId === clientId &&
        answer.conversationId === conversationId &&
        answer.businessId === businessId &&
        answer.paramName === paramName
    );

    if (existing) {
      existing.paramValue = paramValue;
      return;
    }

    this.paramAnswers.push({ clientId, conversationId, businessId, paramName, paramValue });
  }

  async getBusiness(businessId: number): Promise<BusinessDto | null> {
    return this.businesses.get(businessId) || null;
  }

  async getBusinessContext(businessId: number): Promise<BusinessContext | null> {
    return this.businessContexts.get(businessId) || null;
  }

  async upsertBusinessContext(context: BusinessContext): Promise<BusinessContext> {
    this.businessContexts.set(context.businessId, context);
    return context;
  }

  async updateConversationState(conversationId: number, state: ConversationState): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.state.state = state;
    }
  }

  async getBusinessAction(businessId: number): Promise<BusinessActionDto> {
    const action = this.businessActions.get(businessId);
    if (!action) {
      throw new Error(`No action found for business ID ${businessId}`);
    }

    return action;
  }

  async getMessagesByConversation(businessId: number, conversationId: number): Promise<ConversationMessagesResponseDto | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.businessId !== businessId) {
      return null;
    }

    return {
      conversation: this.toConversationSummary(conversation.clientId, conversation.businessId, conversation.state),
      messages: this.messages
        .filter((message) => message.conversationId === conversationId)
        .map((message, index) => ({
          id: index + 1,
          conversationId,
          type: message.type,
          content: message.content,
          status: "received",
          createdAt: conversation.state.updatedAt.toISOString()
        })),
      params: this.paramAnswers
        .filter((answer) => answer.conversationId === conversationId && answer.businessId === businessId)
        .map((answer, index) => ({
          id: index + 1,
          paramName: answer.paramName,
          paramValue: answer.paramValue,
          createdAt: conversation.state.updatedAt.toISOString()
        }))
    };
  }

  async getConversationsByBusinessAndClient(businessId: number, clientId?: number): Promise<ConversationSummaryDto[]> {
    return [...this.conversations.values()]
      .filter((conversation) =>
        conversation.businessId === businessId &&
        (clientId === undefined || conversation.clientId === clientId)
      )
      .map((conversation) => this.toConversationSummary(conversation.clientId, conversation.businessId, conversation.state))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  async getClientsByBusiness(businessId: number): Promise<ClientSummaryDto[]> {
    return [...this.clientsByPhone.values()]
      .map((client) => {
        const clientConversations = [...this.conversations.values()]
          .filter((conversation) => conversation.clientId === client.id && conversation.businessId === businessId);

        return {
          id: client.id,
          phoneNumber: client.phone,
          conversationCount: clientConversations.length,
          lastConversationAt: clientConversations
            .map((conversation) => conversation.state.updatedAt)
            .sort((left, right) => right.getTime() - left.getTime())[0]?.toISOString()
        };
      })
      .filter((client) => client.conversationCount > 0);
  }

  async getLeadsByBusiness(businessId: number): Promise<LeadSummaryDto[]> {
    return [...this.leads.values()]
      .filter((lead) => lead.businessId === businessId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(this.toLeadSummary);
  }

  async getLeadById(businessId: number, leadId: number): Promise<LeadDto | null> {
    const lead = this.leads.get(leadId);
    return lead && lead.businessId === businessId ? this.toLeadDto(lead) : null;
  }

  async createManualLead(businessId: number, leadDto: CreateManualLeadRequestDto): Promise<LeadDto> {
    const name = this.normalizeOptionalString(leadDto.name);
    const phoneNumber = this.normalizeOptionalString(leadDto.phoneNumber);
    if (!leadDto.clientId && !phoneNumber) {
      throw new Error("Manual lead requires clientId or phoneNumber");
    }

    const client = this.resolveLeadClient(leadDto.clientId, phoneNumber, name);
    const now = new Date();
    const lead: SavedLead = {
      id: this.nextLeadId++,
      businessId,
      clientId: client.id,
      memberId: leadDto.memberId || null,
      status: leadDto.status || "NEW",
      source: leadDto.source || "MANUAL",
      score: leadDto.score ?? null,
      summary: this.normalizeOptionalString(leadDto.summary) || null,
      notes: this.normalizeOptionalString(leadDto.notes) || null,
      name: name || client?.name || null,
      phoneNumber: phoneNumber || client?.phone || null,
      createdAt: now,
      updatedAt: now,
      assignedAt: leadDto.memberId ? now : null,
      followUpAt: this.parseOptionalDate(leadDto.followUpAt) || null,
      closedAt: null
    };

    this.leads.set(lead.id, lead);
    return this.toLeadDto(lead);
  }

  async updateLead(businessId: number, leadId: number, leadDto: UpdateLeadRequestDto): Promise<LeadDto> {
    const lead = this.leads.get(leadId);
    if (!lead || lead.businessId !== businessId) {
      throw new Error(`Lead ${leadId} not found for business ${businessId}`);
    }

    if (leadDto.memberId !== undefined) {
      lead.memberId = leadDto.memberId;
      lead.assignedAt = leadDto.memberId ? new Date() : null;
    }
    if (leadDto.status !== undefined) {
      lead.status = leadDto.status;
      if (this.isClosedLeadStatus(leadDto.status)) {
        lead.closedAt = new Date();
      }
    }
    if (leadDto.score !== undefined) lead.score = leadDto.score;
    if (leadDto.summary !== undefined) lead.summary = this.normalizeNullableString(leadDto.summary);
    if (leadDto.notes !== undefined) lead.notes = this.normalizeNullableString(leadDto.notes);
    if (leadDto.name !== undefined) lead.name = this.normalizeNullableString(leadDto.name);
    if (leadDto.phoneNumber !== undefined) lead.phoneNumber = this.normalizeNullableString(leadDto.phoneNumber);
    if (leadDto.followUpAt !== undefined) lead.followUpAt = this.parseOptionalDate(leadDto.followUpAt) || null;
    lead.updatedAt = new Date();

    return this.toLeadDto(lead);
  }

  async deleteLead(businessId: number, leadId: number): Promise<void> {
    const lead = this.leads.get(leadId);
    if (!lead || lead.businessId !== businessId) {
      throw new Error(`Lead ${leadId} not found for business ${businessId}`);
    }

    this.leads.delete(leadId);
  }

  seedBusiness(businessId: number, business: BusinessDto): void {
    this.businesses.set(businessId, business);
  }

  seedConversation(clientId: number, businessId: number, state: ConversationCacheState): void {
    this.conversations.set(state.conversationId, { clientId, businessId, state: this.cloneState(state) });
    this.nextConversationId = Math.max(this.nextConversationId, state.conversationId + 1);
  }

  private hasConversation(conversationId: number): boolean {
    return this.conversations.has(conversationId);
  }

  private toConversationSummary(
    clientId: number,
    businessId: number,
    state: ConversationCacheState
  ): ConversationSummaryDto {
    const conversationMessages = this.messages.filter((message) => message.conversationId === state.conversationId);

    return {
      id: state.conversationId,
      businessId,
      clientId,
      status: state.state,
      conclusion: state.conclusion,
      createdAt: state.updatedAt.toISOString(),
      messageCount: conversationMessages.length,
      lastMessageAt: conversationMessages.length > 0 ? state.updatedAt.toISOString() : undefined
    };
  }

  private toLeadSummary(lead: SavedLead): LeadSummaryDto {
    return {
      id: lead.id,
      businessId: lead.businessId,
      clientId: lead.clientId,
      memberId: lead.memberId,
      status: lead.status,
      source: lead.source,
      score: lead.score,
      summary: lead.summary,
      name: lead.name,
      phoneNumber: lead.phoneNumber,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      assignedAt: lead.assignedAt?.toISOString() || null,
      followUpAt: lead.followUpAt?.toISOString() || null,
      closedAt: lead.closedAt?.toISOString() || null
    };
  }

  private toLeadDto(lead: SavedLead): LeadDto {
    return {
      ...this.toLeadSummary(lead),
      notes: lead.notes
    };
  }

  private resolveLeadClient(clientId?: number, phoneNumber?: string, name?: string): Client {
    if (clientId) {
      const client = [...this.clientsByPhone.values()].find((candidate) => candidate.id === clientId);
      if (!client) {
        throw new Error(`Client ${clientId} not found`);
      }
      if (name) {
        client.name = name;
      }
      return client;
    }

    if (!phoneNumber) {
      throw new Error("Manual lead requires clientId or phoneNumber");
    }

    let client = this.clientsByPhone.get(phoneNumber);
    if (!client) {
      client = {
        id: this.nextClientId++,
        name: name || "Fake Client",
        phone: phoneNumber,
        email: ""
      };
      this.clientsByPhone.set(phoneNumber, client);
      return client;
    }

    if (name) {
      client.name = name;
    }

    return client;
  }

  private normalizeOptionalString(value?: string | null): string | undefined {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : undefined;
  }

  private normalizeNullableString(value?: string | null): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
  }

  private parseOptionalDate(value?: string | null): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === "") return null;

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new Error(`Invalid date: ${value}`);
    }

    return date;
  }

  private isClosedLeadStatus(status: LeadStatusDto): boolean {
    return status === "WON" || status === "LOST" || status === "CLOSED";
  }

  private emptyParamsForBusiness(businessId: number): Record<string, string | number | null> {
    const business = this.businesses.get(businessId);
    if (!business) {
      return {};
    }

    const params = business.parameters.reduce<Record<string, string | number | null>>((params, param) => {
      params[param.paramName] = param.paramValue || null;
      return params;
    }, {});
    ensureClientNameParam(params);
    return params;
  }

  private findClientPhone(clientId: number): string {
    return [...this.clientsByPhone.values()].find((client) => client.id === clientId)?.phone || "";
  }

  private cloneState(state: ConversationCacheState): ConversationCacheState {
    return {
      ...state,
      collectedParams: { ...state.collectedParams },
      lastMessages: state.lastMessages.map((message) => ({ ...message })),
      updatedAt: new Date(state.updatedAt)
    };
  }

  private hydrateState(state: ConversationCacheState): ConversationCacheState {
    const savedMessages = this.messages
      .filter((message) => message.conversationId === state.conversationId)
      .map((message) => ({
        role: message.type,
        content: message.content
      }));
    const cloned = this.cloneState(state);
    if (savedMessages.length > 0) {
      cloned.lastMessages = savedMessages;
    }
    return cloned;
  }
}
