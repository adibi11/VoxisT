import { ISqlInterface } from "../../src/dataClients/SqlClient/sqlInterface";
import { AuthUserDto, BusinessSummaryDto, PlatformRoleDto } from "../../src/contracts";
import { BusinessDto, CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { BusinessContext, Client, ConversationCacheState, ConversationEntity } from "../../src/dataClients/Types/messageTypes";
import { ConversationState } from "../../src/dataClients/Types/stateMachineTypes";

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

export class FakeSqlManager implements ISqlInterface {
  public clientsByPhone = new Map<string, Client>();
  public conversations = new Map<number, { clientId: number; businessId: number; state: ConversationCacheState }>();
  public businesses = new Map<number, BusinessDto>();
  public businessContexts = new Map<number, BusinessContext>();
  public messages: SavedMessage[] = [];
  public paramAnswers: SavedParamAnswer[] = [];
  public createdConversations: { clientId: number; businessId: number; content: string }[] = [];

  private nextClientId = 1;
  private nextConversationId = 1;

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

  private emptyParamsForBusiness(businessId: number): Record<string, string | number | null> {
    const business = this.businesses.get(businessId);
    if (!business) {
      return {};
    }

    return business.parameters.reduce<Record<string, string | number | null>>((params, param) => {
      params[param.paramName] = param.paramValue || null;
      return params;
    }, {});
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
