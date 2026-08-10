import { IDatabaseClient } from "../../src/dataClients/SqlClient/sqlInterface";
import {
  AuthUserDto,
  BusinessChannelDto,
  BusinessResponseMetricsDto,
  BusinessSettingsDto,
  BusinessSummaryDto,
  ClientSummaryDto,
  ConversationMessagesResponseDto,
  ConversationMessageDto,
  ConversationSummaryDto,
  BusinessFollowUpPolicyDto,
  ConversationFollowUpDto,
  ConversationFollowUpStateDto,
  CreateConversationFollowUpRequestDto,
  FollowUpStatusDto,
  UpdateConversationFollowUpRequestDto,
  UpdateConversationFollowUpStateRequestDto,
  CreateManualLeadRequestDto,
  LeadDto,
  LeadSourceDto,
  LeadStatusDto,
  LeadSummaryDto,
  PlatformRoleDto,
  UpdateBusinessSettingsRequestDto,
  UpdateLeadRequestDto,
  UpsertBusinessChannelRequestDto,
  UpsertBusinessFollowUpPolicyRequestDto
} from "../../src/contracts";
import { BusinessActionDto, BusinessDto, CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { BusinessParamConfig, BusinessParamDefinition, BusinessParamType } from "../../src/dataClients/Types/paramTypes";
import { BusinessContext, Client, ConversationCacheState, ConversationEntity } from "../../src/dataClients/Types/messageTypes";
import { ConversationState } from "../../src/dataClients/Types/stateMachineTypes";
import { ILeadRepository } from "../../src/dataClients/SqlClient/Repositories/LeadRepo/ILeadRepository";
import { DueConversationFollowUpCandidate, IFollowUpRepository, OpenConversationPolicyCandidate } from "../../src/dataClients/SqlClient/Repositories/FollowUpRepo/IFollowUpRepository";
import { IBusinessChannelRepository, ResolvedBusinessChannel } from "../../src/dataClients/SqlClient/Repositories/BusinessChannelRepo/IBusinessChannelRepository";
import { normalizePhoneDigits } from "../../src/dataClients/Types/phoneNumber";

type SavedMessage = {
  conversationId: number;
  type: "user" | "bot" | "human";
  content: string;
};

type SavedConversation = {
  clientId: number;
  businessId: number;
  state: ConversationCacheState;
  humanManaged: boolean;
  takenOverByUserId: number | null;
  takenOverAt: Date | null;
  releasedAt: Date | null;
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
  email?: string | null;
  phoneNumber?: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedAt?: Date | null;
  followUpAt?: Date | null;
  closedAt?: Date | null;
};

type SavedBusinessParameter = {
  id: number;
  businessId: number;
  paramName: string;
  use: boolean;
  paramType?: BusinessParamType;
  config?: BusinessParamConfig | null;
};

type SavedBusinessChannel = {
  id: number;
  businessId: number;
  channel: string;
  provider: string;
  displayName?: string | null;
  status: BusinessChannelDto["status"];
  onboardingType: BusinessChannelDto["onboardingType"];
  config?: unknown;
  externalAccountId?: string | null;
  externalPhoneNumberId?: string | null;
  webhookUrl?: string | null;
  isDefault: boolean;
  credentialsEncrypted?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SavedConversationFollowUp = {
  id: number;
  businessId: number;
  conversationId: number;
  leadId?: number | null;
  status: FollowUpStatusDto;
  scheduledFor: Date;
  sentAt?: Date | null;
  skippedReason?: string | null;
  messageBody?: string | null;
  metadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export class FakeSqlManager implements IDatabaseClient {
  readonly leadRepository: ILeadRepository = this;
  readonly followUpRepository: IFollowUpRepository = this;
  readonly businessChannelRepository: IBusinessChannelRepository = this;

  public clientsByPhone = new Map<string, Client>();
  public conversations = new Map<number, SavedConversation>();
  public businesses = new Map<number, BusinessDto>();
  public businessParameters = new Map<number, SavedBusinessParameter>();
  public businessContexts = new Map<number, BusinessContext>();
  public businessActions = new Map<number, BusinessActionDto>();
  public businessChannels = new Map<number, SavedBusinessChannel>();
  public messages: SavedMessage[] = [];
  public paramAnswers: SavedParamAnswer[] = [];
  public leads = new Map<number, SavedLead>();
  public followUpPolicies = new Map<number, BusinessFollowUpPolicyDto>();
  public conversationFollowUps = new Map<number, SavedConversationFollowUp>();
  public createdConversations: { clientId: number; businessId: number; content: string }[] = [];

  private nextClientId = 1;
  private nextConversationId = 1;
  private nextMessageId = 1;
  private messagesByIdempotencyKey = new Map<string, ConversationMessageDto>();
  private nextBusinessParameterId = 1;
  private nextBusinessChannelId = 1;
  private nextLeadId = 1;
  private nextConversationFollowUpId = 1;

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

  async createMessage(
    conversationId: number,
    type: "user" | "bot" | "human",
    content: string,
    idempotencyKey?: string
  ): Promise<ConversationMessageDto> {
    if (idempotencyKey) {
      const existing = this.messagesByIdempotencyKey.get(idempotencyKey);
      if (existing) return existing;
    }
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} does not exist`);
    }
    const id = this.nextMessageId++;
    this.messages.push({ conversationId, type, content });
    const messageCreatedAt = new Date();
    conversation.state.updatedAt = messageCreatedAt;
    const followUpState = conversation.state as ConversationCacheState & {
      lastUserMessageAt?: Date | null;
      lastBotMessageAt?: Date | null;
    };
    if (type === "user") {
      followUpState.lastUserMessageAt = messageCreatedAt;
    } else {
      followUpState.lastBotMessageAt = messageCreatedAt;
    }
    const createdMessage: ConversationMessageDto = {
      id,
      conversationId,
      type,
      content,
      status: "received",
      createdAt: messageCreatedAt.toISOString()
    };
    if (idempotencyKey) this.messagesByIdempotencyKey.set(idempotencyKey, createdMessage);
    return createdMessage;
  }

  async createDbConversation(
    clientId: number,
    businessId: number,
    content: string,
    channel: CommunicationChannel = CommunicationChannel.Whatsapp,
    provider: MessageProvider = MessageProvider.Twilio
  ): Promise<ConversationCacheState> {
    this.createdConversations.push({ clientId, businessId, content });
    const state = {
      conversationId: this.nextConversationId++,
      state: ConversationState.start,
      channel,
      provider,
      collectedParams: this.emptyParamsForBusiness(businessId),
      lastMessages: [],
      updatedAt: new Date(),
      phone: this.findClientPhone(clientId)
    };
    this.conversations.set(state.conversationId, {
      clientId,
      businessId,
      state,
      humanManaged: false,
      takenOverByUserId: null,
      takenOverAt: null,
      releasedAt: null
    });
    return this.cloneState(state);
  }

  async createDbBusiness(businessDto: BusinessDto): Promise<void> {
    const businessId = this.businesses.size + 1;
    this.businesses.set(businessId, businessDto);
    this.seedBusinessParameters(businessId, businessDto.parameters);
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
    this.seedBusinessParameters(businessId, businessDto.parameters);
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

  async getAllUsers(): Promise<AuthUserDto[]> {
    return [];
  }

  async updateUserPassword(_userId: number, _passwordHash: string): Promise<AuthUserDto | null> {
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

  async GetChannelsByBusinessId(businessId: number): Promise<BusinessChannelDto[]> {
    return [...this.businessChannels.values()]
      .filter((channel) => channel.businessId === businessId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((channel) => this.toBusinessChannelDto(channel));
  }

  async UpsertChannelByBusinessId(
    businessId: number,
    channelDto: UpsertBusinessChannelRequestDto
  ): Promise<BusinessChannelDto> {
    const normalizedChannel = channelDto.channel.trim();
    const normalizedProvider = channelDto.provider.trim();
    const existingChannel = [...this.businessChannels.values()].find((channel) =>
      channel.businessId === businessId &&
      channel.channel === normalizedChannel &&
      channel.provider === normalizedProvider
    );
    const now = new Date();

    if (existingChannel) {
      if (channelDto.credentials !== undefined) {
        existingChannel.credentialsEncrypted = channelDto.credentials === null ? null : JSON.stringify(channelDto.credentials);
      }
      existingChannel.displayName = channelDto.displayName === undefined ? existingChannel.displayName : this.normalizeNullableString(channelDto.displayName);
      existingChannel.status = channelDto.status || existingChannel.status;
      existingChannel.onboardingType = channelDto.onboardingType || existingChannel.onboardingType;
      existingChannel.config = channelDto.config === undefined ? existingChannel.config : channelDto.config;
      existingChannel.externalAccountId = channelDto.externalAccountId === undefined ? existingChannel.externalAccountId : this.normalizeNullableString(channelDto.externalAccountId);
      existingChannel.externalPhoneNumberId = channelDto.externalPhoneNumberId === undefined ? existingChannel.externalPhoneNumberId : this.normalizeNullableString(channelDto.externalPhoneNumberId);
      existingChannel.webhookUrl = channelDto.webhookUrl === undefined ? existingChannel.webhookUrl : this.normalizeNullableString(channelDto.webhookUrl);
      existingChannel.isDefault = channelDto.isDefault === undefined ? existingChannel.isDefault : channelDto.isDefault;
      existingChannel.updatedAt = now;
      return this.toBusinessChannelDto(existingChannel);
    }

    const channel: SavedBusinessChannel = {
      id: this.nextBusinessChannelId++,
      businessId,
      channel: normalizedChannel,
      provider: normalizedProvider,
      displayName: this.normalizeNullableString(channelDto.displayName),
      status: channelDto.status || "pending",
      onboardingType: channelDto.onboardingType || "manual",
      config: channelDto.config,
      externalAccountId: this.normalizeNullableString(channelDto.externalAccountId),
      externalPhoneNumberId: this.normalizeNullableString(channelDto.externalPhoneNumberId),
      webhookUrl: this.normalizeNullableString(channelDto.webhookUrl),
      isDefault: channelDto.isDefault ?? false,
      credentialsEncrypted: channelDto.credentials ? JSON.stringify(channelDto.credentials) : null,
      createdAt: now,
      updatedAt: now
    };

    this.businessChannels.set(channel.id, channel);
    return this.toBusinessChannelDto(channel);
  }

  async GetChannelForInbound(provider: string, receivingAddress: string): Promise<ResolvedBusinessChannel | null> {
    const targetDigits = normalizePhoneDigits(receivingAddress);
    if (!targetDigits) {
      return null;
    }

    const match = [...this.businessChannels.values()]
      .filter((channel) =>
        channel.provider === provider &&
        !["disabled", "failed"].includes(channel.status) &&
        Boolean(channel.externalPhoneNumberId)
      )
      .sort((left, right) => left.id - right.id)
      .find((channel) => normalizePhoneDigits(channel.externalPhoneNumberId) === targetDigits);

    return match ? this.toResolvedChannel(match) : null;
  }

  async GetChannelForOutbound(
    businessId: number,
    provider: string,
    fromAddress?: string
  ): Promise<ResolvedBusinessChannel | null> {
    const candidates = [...this.businessChannels.values()]
      .filter((channel) =>
        channel.businessId === businessId &&
        channel.provider === provider &&
        !["disabled", "failed"].includes(channel.status)
      )
      .sort((left, right) => left.id - right.id);

    if (candidates.length === 0) {
      return null;
    }

    const fromDigits = normalizePhoneDigits(fromAddress);
    const byFromNumber = fromDigits
      ? candidates.find((channel) => normalizePhoneDigits(channel.externalPhoneNumberId) === fromDigits)
      : undefined;
    const match = byFromNumber || candidates.find((channel) => channel.isDefault) || candidates[0];

    return this.toResolvedChannel(match);
  }

  private toResolvedChannel(channel: SavedBusinessChannel): ResolvedBusinessChannel {
    return {
      channel: this.toBusinessChannelDto(channel),
      credentials: channel.credentialsEncrypted ? JSON.parse(channel.credentialsEncrypted) : null
    };
  }

  async upsertBusiness(businessDto: BusinessDto, businessId: number): Promise<BusinessDto> {
    this.businesses.set(businessId, businessDto);
    this.seedBusinessParameters(businessId, businessDto.parameters);
    return businessDto;
  }

  async getBusinessSettings(businessId: number): Promise<BusinessSettingsDto | null> {
    const business = this.businesses.get(businessId);
    if (!business) {
      return null;
    }

    return {
      id: businessId,
      name: business.name,
      phone: business.phone,
      email: business.email,
      starterMessage: business.starterMessage,
      endMessage: business.endMessage,
      escalationMessage: business.escalationMessage,
      language: business.language || "en",
      parameters: [...this.businessParameters.values()]
        .filter((param) => param.businessId === businessId)
        .sort((left, right) => left.id - right.id)
        .map((param) => ({
          id: param.id,
          paramName: param.paramName,
          use: param.use,
          paramType: param.paramType || BusinessParamType.Text,
          config: param.config ?? null,
          paramValue: null
        })),
      action: this.businessActions.get(businessId)
        ? {
            action: this.businessActions.get(businessId)!.action,
            provider: this.businessActions.get(businessId)!.provider ?? null,
            config: this.businessActions.get(businessId)!.config
          }
        : null
    };
  }

  async updateBusinessSettings(businessId: number, request: UpdateBusinessSettingsRequestDto): Promise<BusinessSettingsDto> {
    const existingBusiness = this.businesses.get(businessId);
    if (!existingBusiness) {
      throw new Error(`Business ${businessId} not found`);
    }

    const parameters = request.parameters.map((parameter) => ({
      id: parameter.id,
      paramName: parameter.paramName.trim(),
      use: parameter.use ?? true,
      paramType: (parameter.paramType as BusinessParamType | undefined) || BusinessParamType.Text,
      config: (parameter.config as BusinessParamConfig | null | undefined) ?? null
    }));
    for (const parameter of parameters) {
      if (parameter.id !== undefined) {
        const existingParameter = this.businessParameters.get(parameter.id);
        if (!existingParameter || existingParameter.businessId !== businessId) {
          throw new Error(`Business parameter ${parameter.id} does not belong to business ${businessId}`);
        }
        existingParameter.paramName = parameter.paramName;
        existingParameter.use = parameter.use;
        existingParameter.paramType = parameter.paramType;
        existingParameter.config = parameter.config;
      } else {
        const id = this.nextBusinessParameterId++;
        this.businessParameters.set(id, {
          id,
          businessId,
          paramName: parameter.paramName,
          use: parameter.use,
          paramType: parameter.paramType,
          config: parameter.config
        });
      }
    }

    this.businesses.set(businessId, {
      ...existingBusiness,
      name: request.name,
      phone: request.phone,
      email: request.email,
      starterMessage: request.starterMessage,
      endMessage: request.endMessage,
      escalationMessage: request.escalationMessage,
      language: request.language || "en",
      parameters: parameters.map((param) => ({
        paramName: param.paramName,
        use: param.use
      }))
    });

    if (request.action) {
      this.businessActions.set(businessId, {
        businessId,
        action: request.action.action as BusinessActionDto["action"],
        provider: request.action.provider || undefined,
        config: request.action.config
      });
    } else {
      this.businessActions.delete(businessId);
    }

    return this.getBusinessSettings(businessId) as Promise<BusinessSettingsDto>;
  }

  async upsertBusinessAction(businessId: number, actionDto: BusinessActionDto): Promise<void> {
    this.businessActions.set(businessId, { ...actionDto, businessId });
  }

  async getActiveBusinessParameterNames(businessId: number): Promise<string[]> {
    return [...this.businessParameters.values()]
      .filter((parameter) => parameter.businessId === businessId && parameter.use)
      .sort((left, right) => left.id - right.id)
      .map((parameter) => parameter.paramName);
  }

  async getActiveBusinessParameterDefinitions(businessId: number): Promise<BusinessParamDefinition[]> {
    return [...this.businessParameters.values()]
      .filter((parameter) => parameter.businessId === businessId && parameter.use)
      .sort((left, right) => left.id - right.id)
      .map((parameter) => ({
        id: parameter.id,
        paramName: parameter.paramName,
        type: parameter.paramType || BusinessParamType.Text,
        config: parameter.config || {}
      }));
  }

  public aiScheduledTasks = new Map<string, { taskId: number; businessId: number; clientId: number; conversationId: number; scheduledFor: Date; updates: number }>();
  public activityEvents: Array<{ businessId: number; aggregateType: string; aggregateId: number; eventType: string; dedupeKey: string }> = [];
  private nextAiTaskId = 9000;

  async upsertConversationScheduledTask(args: {
    businessId: number;
    clientId: number;
    conversationId: number;
    scheduledFor: Date;
    clientName?: string | null;
    clientPhone?: string | null;
    summary?: string | null;
  }): Promise<{ taskId: number; created: boolean }> {
    const key = `${args.businessId}:${args.clientId}`;
    const existing = this.aiScheduledTasks.get(key);

    if (existing) {
      existing.scheduledFor = args.scheduledFor;
      existing.conversationId = args.conversationId;
      existing.updates += 1;
      this.activityEvents.push({
        businessId: args.businessId,
        aggregateType: "TASK",
        aggregateId: existing.taskId,
        eventType: "TASK_UPDATED",
        dedupeKey: `task:${existing.taskId}:ai_reschedule:${args.scheduledFor.toISOString()}`
      });
      return { taskId: existing.taskId, created: false };
    }

    const taskId = this.nextAiTaskId++;
    this.aiScheduledTasks.set(key, {
      taskId,
      businessId: args.businessId,
      clientId: args.clientId,
      conversationId: args.conversationId,
      scheduledFor: args.scheduledFor,
      updates: 0
    });
    this.activityEvents.push({
      businessId: args.businessId,
      aggregateType: "TASK",
      aggregateId: taskId,
      eventType: "TASK_CREATED",
      dedupeKey: `task:${taskId}:created`
    });
    return { taskId, created: true };
  }

  async getBusinessResponseMetrics(
    businessId: number,
    from: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: Date = new Date()
  ): Promise<BusinessResponseMetricsDto> {
    const businessConversationIds = [...this.conversations.values()]
      .filter((conversation) => conversation.businessId === businessId)
      .map((conversation) => conversation.state.conversationId);

    return {
      businessId,
      from: from.toISOString(),
      to: to.toISOString(),
      averageResponseTimeMs: null,
      averageResponseTimeSeconds: null,
      responsePairCount: 0,
      conversationCount: businessConversationIds.length
    };
  }

  async scoreAndCreateLeadForConversation(
    clientId: number,
    businessId: number,
    conversationId: number
  ): Promise<void> {
    const activeParamNames = await this.getActiveBusinessParameterNames(businessId);
    if (activeParamNames.length === 0) {
      return;
    }

    const answeredParamCount = new Set(
      this.paramAnswers
        .filter((answer) =>
          answer.clientId === clientId &&
          answer.businessId === businessId &&
          answer.conversationId === conversationId &&
          activeParamNames.includes(answer.paramName) &&
          answer.paramValue
        )
        .map((answer) => answer.paramName)
    ).size;
    const parameterScore = answeredParamCount / activeParamNames.length;
    const score = Math.round(100 * (parameterScore * 0.75 + 0.25));
    const existingLead = [...this.leads.values()]
      .filter((lead) =>
        lead.businessId === businessId &&
        lead.clientId === clientId &&
        !["WON", "LOST", "CLOSED"].includes(lead.status)
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id - left.id)[0];

    if (existingLead) {
      existingLead.score = score;
      if (score >= 65) {
        existingLead.status = "QUALIFIED";
      }
      existingLead.updatedAt = new Date();
      return;
    }

    if (score < 65) {
      return;
    }

    const client = this.findClientById(clientId);
    const now = new Date();
    const lead: SavedLead = {
      id: this.nextLeadId++,
      businessId,
      clientId,
      memberId: null,
      status: "QUALIFIED",
      source: "WHATSAPP",
      score,
      summary: `Auto-qualified from conversation ${conversationId} with score ${score}.`,
      notes: null,
      name: client?.name || null,
      phoneNumber: client?.phone || null,
      createdAt: now,
      updatedAt: now,
      assignedAt: null,
      followUpAt: null,
      closedAt: null
    };
    this.leads.set(lead.id, lead);
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

  async getClientPhoneNumber(clientId: number): Promise<string | null> {
    return this.findClientById(clientId)?.phone ?? null;
  }

  async isConversationHumanManaged(clientId: number, businessId: number): Promise<boolean> {
    const conversation = [...this.conversations.values()]
      .filter((item) => item.clientId === clientId && item.businessId === businessId)
      .sort((left, right) => right.state.updatedAt.getTime() - left.state.updatedAt.getTime())[0];

    return conversation?.humanManaged ?? false;
  }

  async getConversationForBusinessAndClient(businessId: number, clientId: number, conversationId: number): Promise<ConversationSummaryDto | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.businessId !== businessId || conversation.clientId !== clientId) {
      return null;
    }
    return this.toConversationSummary(conversation);
  }

  async setHumanTakeover(conversationId: number, userId: number): Promise<ConversationSummaryDto> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} does not exist`);
    }
    conversation.humanManaged = true;
    conversation.takenOverByUserId = userId;
    conversation.takenOverAt = new Date();
    conversation.state.state = ConversationState.humanTakeover;
    return this.toConversationSummary(conversation);
  }

  async releaseHumanTakeover(conversationId: number): Promise<ConversationSummaryDto> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} does not exist`);
    }
    conversation.releasedAt = new Date();
    conversation.state.state = ConversationState.ended;
    return this.toConversationSummary(conversation);
  }

  async createHumanConversation(
    clientId: number,
    businessId: number,
    userId: number,
    channel: CommunicationChannel = CommunicationChannel.Whatsapp,
    provider: MessageProvider = MessageProvider.Twilio
  ): Promise<ConversationSummaryDto> {
    const conversationId = this.nextConversationId++;
    const now = new Date();
    const state: ConversationCacheState = {
      conversationId,
      state: ConversationState.humanTakeover,
      channel,
      provider,
      collectedParams: this.emptyParamsForBusiness(businessId),
      lastMessages: [],
      updatedAt: now,
      phone: this.findClientPhone(clientId)
    };
    const conversation: SavedConversation = {
      clientId,
      businessId,
      state,
      humanManaged: true,
      takenOverByUserId: userId,
      takenOverAt: now,
      releasedAt: null
    };
    this.conversations.set(conversationId, conversation);
    return this.toConversationSummary(conversation);
  }

  async createConversationMessageActivityEvent(businessId: number, conversationId: number, messageId: number): Promise<void> {
    this.activityEvents.push({
      businessId,
      aggregateType: "CONVERSATION",
      aggregateId: conversationId,
      eventType: "CONVERSATION_MESSAGE_RECEIVED",
      dedupeKey: `message:${messageId}:conversation_message_received`
    });
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
      conversation: this.toConversationSummary(conversation),
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
      .map((conversation) => this.toConversationSummary(conversation))
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
    const email = this.normalizeOptionalEmail(leadDto.email);
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
      email: email || null,
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
    if (leadDto.email !== undefined) lead.email = this.normalizeNullableEmail(leadDto.email);
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

  async getBusinessFollowUpPolicy(businessId: number): Promise<BusinessFollowUpPolicyDto | null> {
    return this.followUpPolicies.get(businessId) || null;
  }

  async getOpenConversationPolicyCandidates(limit: number): Promise<OpenConversationPolicyCandidate[]> {
    const take = Math.max(1, Math.min(limit, 100));
    return [...this.conversations.values()]
      .map((conversation) => {
        const policy = this.followUpPolicies.get(conversation.businessId);
        const business = this.businesses.get(conversation.businessId);
        const client = this.findClientById(conversation.clientId);
        const lead = this.findLatestLeadForConversation(conversation.businessId, conversation.clientId);
        return { conversation, policy, business, client, lead };
      })
      .filter((item) =>
        item.policy?.enabled &&
        item.business &&
        item.client &&
        !["ended", "failure", "schedulingConfirmed", "schedulingFailed"].includes(item.conversation.state.state)
      )
      .filter((item) => {
        const followUpState = item.conversation.state as ConversationCacheState & {
          lastUserMessageAt?: Date | null;
          lastBotMessageAt?: Date | null;
          followUpCount?: number;
        };
        return Boolean(followUpState.lastBotMessageAt) &&
          (!followUpState.lastUserMessageAt || followUpState.lastUserMessageAt < followUpState.lastBotMessageAt!) &&
          (followUpState.followUpCount || 0) < item.policy!.maxFollowUps;
      })
      .filter((item) => ![...this.conversationFollowUps.values()].some((followUp) =>
        followUp.businessId === item.conversation.businessId &&
        followUp.conversationId === item.conversation.state.conversationId &&
        (followUp.status === "PENDING" || followUp.status === "PROCESSING")
      ))
      .sort((left, right) => {
        const leftState = left.conversation.state as ConversationCacheState & { lastBotMessageAt?: Date | null };
        const rightState = right.conversation.state as ConversationCacheState & { lastBotMessageAt?: Date | null };
        return (leftState.lastBotMessageAt?.getTime() || 0) - (rightState.lastBotMessageAt?.getTime() || 0) ||
          left.conversation.state.conversationId - right.conversation.state.conversationId;
      })
      .slice(0, take)
      .map((item) => this.toOpenConversationPolicyCandidate(
        item.conversation,
        item.policy!,
        item.business!,
        item.client!,
        item.lead
      ));
  }

  async getDuePendingFollowUps(now: Date, limit: number): Promise<DueConversationFollowUpCandidate[]> {
    const take = Math.max(1, Math.min(limit, 100));
    return [...this.conversationFollowUps.values()]
      .filter((followUp) => followUp.status === "PENDING" && followUp.scheduledFor <= now)
      .map((followUp) => {
        const conversation = this.conversations.get(followUp.conversationId);
        const policy = this.followUpPolicies.get(followUp.businessId);
        const business = this.businesses.get(followUp.businessId);
        const client = conversation ? this.findClientById(conversation.clientId) : null;
        const lead = followUp.leadId ? this.leads.get(followUp.leadId) || null : null;
        return { followUp, conversation, policy, business, client, lead };
      })
      .filter((item) =>
        item.conversation &&
        item.policy?.enabled &&
        item.business &&
        item.client &&
        !["ended", "failure", "schedulingConfirmed", "schedulingFailed"].includes(item.conversation.state.state)
      )
      .filter((item) => {
        const followUpState = item.conversation!.state as ConversationCacheState & { followUpCount?: number };
        return (followUpState.followUpCount || 0) < item.policy!.maxFollowUps;
      })
      .sort((left, right) => left.followUp.scheduledFor.getTime() - right.followUp.scheduledFor.getTime() || left.followUp.id - right.followUp.id)
      .slice(0, take)
      .map((item) => this.toDueConversationFollowUpCandidate(
        item.followUp,
        item.conversation!,
        item.policy!,
        item.business!,
        item.client!,
        item.lead
      ));
  }

  async claimPendingFollowUp(followUpId: number): Promise<ConversationFollowUpDto | null> {
    const followUp = this.conversationFollowUps.get(followUpId);
    if (!followUp || followUp.status !== "PENDING") {
      return null;
    }

    followUp.status = "PROCESSING";
    followUp.updatedAt = new Date();
    return this.toConversationFollowUpDto(followUp);
  }

  async upsertBusinessFollowUpPolicy(
    businessId: number,
    request: UpsertBusinessFollowUpPolicyRequestDto
  ): Promise<BusinessFollowUpPolicyDto> {
    const now = new Date().toISOString();
    const existingPolicy = this.followUpPolicies.get(businessId);
    const policy: BusinessFollowUpPolicyDto = {
      id: existingPolicy?.id || businessId,
      businessId,
      enabled: request.enabled ?? existingPolicy?.enabled ?? false,
      timezone: request.timezone?.trim() || existingPolicy?.timezone || "UTC",
      delayMinutes: request.delayMinutes ?? existingPolicy?.delayMinutes ?? 1440,
      allowedStartHour: request.allowedStartHour === undefined ? existingPolicy?.allowedStartHour ?? null : request.allowedStartHour,
      allowedEndHour: request.allowedEndHour === undefined ? existingPolicy?.allowedEndHour ?? null : request.allowedEndHour,
      maxFollowUps: request.maxFollowUps ?? existingPolicy?.maxFollowUps ?? 1,
      messageTemplate: request.messageTemplate === undefined ? existingPolicy?.messageTemplate ?? null : this.normalizeNullableString(request.messageTemplate),
      createdAt: existingPolicy?.createdAt || now,
      updatedAt: now
    };

    this.followUpPolicies.set(businessId, policy);
    return policy;
  }

  async getConversationFollowUpState(businessId: number, conversationId: number): Promise<ConversationFollowUpStateDto | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.businessId !== businessId) {
      return null;
    }

    return this.toConversationFollowUpState(conversation.clientId, conversation.businessId, conversation.state);
  }

  async getActiveConversationFollowUpStates(businessId?: number): Promise<ConversationFollowUpStateDto[]> {
    return [...this.conversations.values()]
      .filter((conversation) => businessId === undefined || conversation.businessId === businessId)
      .filter((conversation) => !["ended", "failure", "schedulingConfirmed", "schedulingFailed"].includes(conversation.state.state))
      .map((conversation) => this.toConversationFollowUpState(conversation.clientId, conversation.businessId, conversation.state));
  }

  async updateConversationFollowUpState(
    conversationId: number,
    request: UpdateConversationFollowUpStateRequestDto
  ): Promise<ConversationFollowUpStateDto> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const followUpState = conversation.state as ConversationCacheState & {
      lastUserMessageAt?: Date | null;
      lastBotMessageAt?: Date | null;
      lastFollowUpAt?: Date | null;
      followUpCount?: number;
      nextFollowUpAt?: Date | null;
    };

    if (request.lastUserMessageAt !== undefined) followUpState.lastUserMessageAt = this.parseOptionalDate(request.lastUserMessageAt) || null;
    if (request.lastBotMessageAt !== undefined) followUpState.lastBotMessageAt = this.parseOptionalDate(request.lastBotMessageAt) || null;
    if (request.lastFollowUpAt !== undefined) followUpState.lastFollowUpAt = this.parseOptionalDate(request.lastFollowUpAt) || null;
    if (request.followUpCount !== undefined) followUpState.followUpCount = request.followUpCount;
    if (request.nextFollowUpAt !== undefined) followUpState.nextFollowUpAt = this.parseOptionalDate(request.nextFollowUpAt) || null;

    return this.toConversationFollowUpState(conversation.clientId, conversation.businessId, conversation.state);
  }

  async getConversationFollowUps(businessId: number, conversationId: number): Promise<ConversationFollowUpDto[]> {
    return [...this.conversationFollowUps.values()]
      .filter((followUp) => followUp.businessId === businessId && followUp.conversationId === conversationId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((followUp) => this.toConversationFollowUpDto(followUp));
  }

  async createConversationFollowUp(
    businessId: number,
    request: CreateConversationFollowUpRequestDto
  ): Promise<ConversationFollowUpDto> {
    const now = new Date();
    const followUp: SavedConversationFollowUp = {
      id: this.nextConversationFollowUpId++,
      businessId,
      conversationId: request.conversationId,
      leadId: request.leadId ?? null,
      status: request.status || "PENDING",
      scheduledFor: this.parseRequiredDate(request.scheduledFor),
      sentAt: this.parseOptionalDate(request.sentAt) || null,
      skippedReason: this.normalizeNullableString(request.skippedReason),
      messageBody: this.normalizeNullableString(request.messageBody),
      metadata: request.metadata,
      createdAt: now,
      updatedAt: now
    };

    this.conversationFollowUps.set(followUp.id, followUp);
    return this.toConversationFollowUpDto(followUp);
  }

  async updateConversationFollowUp(
    businessId: number,
    followUpId: number,
    request: UpdateConversationFollowUpRequestDto
  ): Promise<ConversationFollowUpDto> {
    const followUp = this.conversationFollowUps.get(followUpId);
    if (!followUp || followUp.businessId !== businessId) {
      throw new Error(`Conversation follow-up ${followUpId} not found for business ${businessId}`);
    }

    if (request.leadId !== undefined) followUp.leadId = request.leadId;
    if (request.status !== undefined) followUp.status = request.status;
    if (request.scheduledFor !== undefined) followUp.scheduledFor = this.parseRequiredDate(request.scheduledFor);
    if (request.sentAt !== undefined) followUp.sentAt = this.parseOptionalDate(request.sentAt) || null;
    if (request.skippedReason !== undefined) followUp.skippedReason = this.normalizeNullableString(request.skippedReason);
    if (request.messageBody !== undefined) followUp.messageBody = this.normalizeNullableString(request.messageBody);
    if (request.metadata !== undefined) followUp.metadata = request.metadata;
    followUp.updatedAt = new Date();

    return this.toConversationFollowUpDto(followUp);
  }

  async deleteConversationFollowUpsCreatedBefore(businessId: number, createdBefore: Date): Promise<number> {
    let deletedCount = 0;
    for (const [followUpId, followUp] of this.conversationFollowUps.entries()) {
      if (followUp.businessId === businessId && followUp.createdAt < createdBefore) {
        this.conversationFollowUps.delete(followUpId);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  seedBusiness(businessId: number, business: BusinessDto): void {
    this.businesses.set(businessId, business);
    this.seedBusinessParameters(businessId, business.parameters);
  }

  seedConversation(clientId: number, businessId: number, state: ConversationCacheState): void {
    this.conversations.set(state.conversationId, {
      clientId,
      businessId,
      state: this.cloneState(state),
      humanManaged: false,
      takenOverByUserId: null,
      takenOverAt: null,
      releasedAt: null
    });
    this.nextConversationId = Math.max(this.nextConversationId, state.conversationId + 1);
  }

  private hasConversation(conversationId: number): boolean {
    return this.conversations.has(conversationId);
  }

  private seedBusinessParameters(businessId: number, parameters: Array<{ paramName: string; use?: boolean }>): void {
    for (const [parameterId, parameter] of this.businessParameters.entries()) {
      if (parameter.businessId === businessId) {
        this.businessParameters.delete(parameterId);
      }
    }

    for (const parameter of parameters) {
      const id = this.nextBusinessParameterId++;
      this.businessParameters.set(id, {
        id,
        businessId,
        paramName: parameter.paramName,
        use: parameter.use ?? true
      });
    }
  }

  private toBusinessChannelDto(channel: SavedBusinessChannel): BusinessChannelDto {
    return {
      id: channel.id,
      businessId: channel.businessId,
      channel: channel.channel,
      provider: channel.provider,
      displayName: channel.displayName ?? null,
      status: channel.status,
      onboardingType: channel.onboardingType,
      config: channel.config,
      externalAccountId: channel.externalAccountId ?? null,
      externalPhoneNumberId: channel.externalPhoneNumberId ?? null,
      webhookUrl: channel.webhookUrl ?? null,
      isDefault: channel.isDefault,
      hasCredentials: Boolean(channel.credentialsEncrypted),
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString()
    };
  }

  private toConversationSummary(conversation: SavedConversation): ConversationSummaryDto {
    const { clientId, businessId, state } = conversation;
    const conversationMessages = this.messages.filter((message) => message.conversationId === state.conversationId);

    return {
      id: state.conversationId,
      businessId,
      clientId,
      status: state.state,
      channel: state.channel,
      provider: state.provider || MessageProvider.Twilio,
      conclusion: state.conclusion,
      createdAt: state.updatedAt.toISOString(),
      messageCount: conversationMessages.length,
      lastMessageAt: conversationMessages.length > 0 ? state.updatedAt.toISOString() : undefined,
      humanManaged: conversation.humanManaged,
      takenOverByUserId: conversation.takenOverByUserId,
      takenOverAt: conversation.takenOverAt?.toISOString() ?? null,
      releasedAt: conversation.releasedAt?.toISOString() ?? null
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
      email: lead.email,
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

  private toConversationFollowUpState(
    clientId: number,
    businessId: number,
    state: ConversationCacheState
  ): ConversationFollowUpStateDto {
    const followUpState = state as ConversationCacheState & {
      lastUserMessageAt?: Date | null;
      lastBotMessageAt?: Date | null;
      lastFollowUpAt?: Date | null;
      followUpCount?: number;
      nextFollowUpAt?: Date | null;
    };

    return {
      conversationId: state.conversationId,
      businessId,
      clientId,
      status: state.state,
      channel: state.channel,
      provider: state.provider || MessageProvider.Twilio,
      createdAt: state.updatedAt.toISOString(),
      lastUserMessageAt: followUpState.lastUserMessageAt?.toISOString() || null,
      lastBotMessageAt: followUpState.lastBotMessageAt?.toISOString() || null,
      lastFollowUpAt: followUpState.lastFollowUpAt?.toISOString() || null,
      followUpCount: followUpState.followUpCount || 0,
      nextFollowUpAt: followUpState.nextFollowUpAt?.toISOString() || null
    };
  }

  private toConversationFollowUpDto(followUp: SavedConversationFollowUp): ConversationFollowUpDto {
    return {
      id: followUp.id,
      businessId: followUp.businessId,
      conversationId: followUp.conversationId,
      leadId: followUp.leadId ?? null,
      status: followUp.status,
      scheduledFor: followUp.scheduledFor.toISOString(),
      sentAt: followUp.sentAt?.toISOString() || null,
      skippedReason: followUp.skippedReason ?? null,
      messageBody: followUp.messageBody ?? null,
      metadata: followUp.metadata,
      createdAt: followUp.createdAt.toISOString(),
      updatedAt: followUp.updatedAt.toISOString()
    };
  }

  private toDueConversationFollowUpCandidate(
    followUp: SavedConversationFollowUp,
    conversation: { clientId: number; businessId: number; state: ConversationCacheState },
    policy: BusinessFollowUpPolicyDto,
    business: BusinessDto,
    client: Client,
    lead?: SavedLead | null
  ): DueConversationFollowUpCandidate {
    const followUpState = conversation.state as ConversationCacheState & {
      lastUserMessageAt?: Date | null;
      lastBotMessageAt?: Date | null;
      lastFollowUpAt?: Date | null;
      followUpCount?: number;
      nextFollowUpAt?: Date | null;
    };

    return {
      followUp: {
        id: followUp.id,
        businessId: followUp.businessId,
        conversationId: followUp.conversationId,
        leadId: followUp.leadId ?? null,
        status: "PENDING",
        scheduledFor: followUp.scheduledFor.toISOString(),
        messageBody: followUp.messageBody ?? null,
        metadata: followUp.metadata
      },
      policy: {
        timezone: policy.timezone,
        delayMinutes: policy.delayMinutes,
        allowedStartHour: policy.allowedStartHour ?? null,
        allowedEndHour: policy.allowedEndHour ?? null,
        maxFollowUps: policy.maxFollowUps,
        messageTemplate: policy.messageTemplate ?? null
      },
      conversation: {
        id: conversation.state.conversationId,
        businessId: conversation.businessId,
        clientId: conversation.clientId,
        status: conversation.state.state,
        channel: conversation.state.channel,
        provider: conversation.state.provider || MessageProvider.Twilio,
        createdAt: conversation.state.updatedAt.toISOString(),
        lastUserMessageAt: followUpState.lastUserMessageAt?.toISOString() || null,
        lastBotMessageAt: followUpState.lastBotMessageAt?.toISOString() || null,
        lastFollowUpAt: followUpState.lastFollowUpAt?.toISOString() || null,
        followUpCount: followUpState.followUpCount || 0,
        nextFollowUpAt: followUpState.nextFollowUpAt?.toISOString() || null
      },
      business: {
        id: followUp.businessId,
        name: business.name,
        phone: business.phone,
        language: business.language || "en"
      },
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone
      },
      lead: lead
        ? {
          id: lead.id,
          source: lead.source,
          status: lead.status,
          name: lead.name,
          phoneNumber: lead.phoneNumber
        }
        : null
    };
  }

  private toOpenConversationPolicyCandidate(
    conversation: { clientId: number; businessId: number; state: ConversationCacheState },
    policy: BusinessFollowUpPolicyDto,
    business: BusinessDto,
    client: Client,
    lead?: SavedLead | null
  ): OpenConversationPolicyCandidate {
    const followUpState = conversation.state as ConversationCacheState & {
      lastUserMessageAt?: Date | null;
      lastBotMessageAt?: Date | null;
      lastFollowUpAt?: Date | null;
      followUpCount?: number;
      nextFollowUpAt?: Date | null;
    };

    return {
      policy: {
        timezone: policy.timezone,
        delayMinutes: policy.delayMinutes,
        allowedStartHour: policy.allowedStartHour ?? null,
        allowedEndHour: policy.allowedEndHour ?? null,
        maxFollowUps: policy.maxFollowUps,
        messageTemplate: policy.messageTemplate ?? null
      },
      conversation: {
        id: conversation.state.conversationId,
        businessId: conversation.businessId,
        clientId: conversation.clientId,
        status: conversation.state.state,
        channel: conversation.state.channel,
        provider: conversation.state.provider || MessageProvider.Twilio,
        createdAt: conversation.state.updatedAt.toISOString(),
        lastUserMessageAt: followUpState.lastUserMessageAt?.toISOString() || null,
        lastBotMessageAt: followUpState.lastBotMessageAt?.toISOString() || null,
        lastFollowUpAt: followUpState.lastFollowUpAt?.toISOString() || null,
        followUpCount: followUpState.followUpCount || 0,
        nextFollowUpAt: followUpState.nextFollowUpAt?.toISOString() || null
      },
      business: {
        id: conversation.businessId,
        name: business.name,
        phone: business.phone,
        language: business.language || "en"
      },
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone
      },
      lead: lead
        ? {
          id: lead.id,
          source: lead.source,
          status: lead.status,
          name: lead.name,
          phoneNumber: lead.phoneNumber
        }
        : null
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

  private normalizeOptionalEmail(value?: string | null): string | undefined {
    const normalizedValue = value?.trim().toLowerCase();
    return normalizedValue || undefined;
  }

  private normalizeNullableString(value?: string | null): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
  }

  private normalizeNullableEmail(value?: string | null): string | null {
    const normalizedValue = value?.trim().toLowerCase();
    return normalizedValue || null;
  }

  private parseOptionalDate(value?: string | null): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === "") return null;

    return this.parseRequiredDate(value);
  }

  private parseRequiredDate(value: string): Date {
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
    if (!this.businesses.has(businessId)) {
      return {};
    }

    const params = [...this.businessParameters.values()]
      .filter((parameter) => parameter.businessId === businessId && parameter.use)
      .sort((left, right) => left.id - right.id)
      .reduce<Record<string, string | number | null>>((params, param) => {
      params[param.paramName] = null;
      return params;
    }, {});
    return params;
  }

  private findClientPhone(clientId: number): string {
    return [...this.clientsByPhone.values()].find((client) => client.id === clientId)?.phone || "";
  }

  private findClientById(clientId: number): Client | null {
    return [...this.clientsByPhone.values()].find((client) => client.id === clientId) || null;
  }

  private findLatestLeadForConversation(businessId: number, clientId: number): SavedLead | null {
    return [...this.leads.values()]
      .filter((lead) => lead.businessId === businessId && lead.clientId === clientId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id - left.id)[0] || null;
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
        role: message.type as "user" | "bot",
        content: message.content
      }));
    const cloned = this.cloneState(state);
    if (savedMessages.length > 0) {
      cloned.lastMessages = savedMessages;
    }
    return cloned;
  }
}
