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
  public conversations = new Map<string, ConversationCacheState>();
  public businesses = new Map<number, BusinessDto>();
  public businessContexts = new Map<number, BusinessContext>();
  public messages: SavedMessage[] = [];
  public paramAnswers: SavedParamAnswer[] = [];
  public createdConversations: { clientId: number; businessId: number; content: string }[] = [];

  private nextClientId = 1;
  private nextConversationId = 1;

  async getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null> {
    const state = this.conversations.get(this.key(clientId, businessId));
    return state ? this.cloneState(state) : null;
  }

  async getConversationEntity(_clientId: number, _businessId: number): Promise<ConversationEntity> {
    throw new Error("FakeSqlManager.getConversationEntity is not implemented for current tests");
  }

  async createMessage(conversationId: number, type: "user" | "bot", content: string): Promise<void> {
    if (!this.hasConversation(conversationId)) {
      throw new Error(`Conversation ${conversationId} does not exist`);
    }
    this.messages.push({ conversationId, type, content });
  }

  async createDbConversation(clientId: number, businessId: number, content: string): Promise<void> {
    this.createdConversations.push({ clientId, businessId, content });
    this.conversations.set(this.key(clientId, businessId), {
      conversationId: this.nextConversationId++,
      state: ConversationState.start,
      channel: CommunicationChannel.Whatsapp,
      provider: MessageProvider.Twilio,
      collectedParams: this.emptyParamsForBusiness(businessId),
      lastMessages: [],
      updatedAt: new Date(),
      phone: this.findClientPhone(clientId)
    });
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
    for (const conversation of this.conversations.values()) {
      if (conversation.conversationId === conversationId) {
        conversation.state = state;
        return;
      }
    }
  }

  seedBusiness(businessId: number, business: BusinessDto): void {
    this.businesses.set(businessId, business);
  }

  seedConversation(clientId: number, businessId: number, state: ConversationCacheState): void {
    this.conversations.set(this.key(clientId, businessId), this.cloneState(state));
  }

  private hasConversation(conversationId: number): boolean {
    return [...this.conversations.values()].some((state) => state.conversationId === conversationId);
  }

  private key(clientId: number, businessId: number): string {
    return `${clientId}:${businessId}`;
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
}
