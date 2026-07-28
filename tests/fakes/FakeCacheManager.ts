import { ICacheManager } from "../../src/dataClients/CacheClient/cacheInterface";
import { ConversationCacheState } from "../../src/dataClients/Types/messageTypes";

export class FakeCacheManager implements ICacheManager {
  public states = new Map<string, ConversationCacheState>();
  public activeConversationIds = new Map<string, number>();
  public lockedKeys = new Set<string>();
  public lockRequests: { clientId: number; businessId: number }[] = [];
  public releasedLocks: { clientId: number; businessId: number }[] = [];
  public cancelledTakeovers = new Set<string>();

  constructor(initialStates?: {
    clientId: number;
    businessId: number;
    state: ConversationCacheState;
  }[]) {
    for (const item of initialStates || []) {
      this.activeConversationIds.set(this.key(item.clientId, item.businessId), item.state.conversationId);
      this.states.set(this.conversationKey(item.state.conversationId), this.cloneState(item.state));
    }
  }

  async getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null> {
    const conversationId = await this.getActiveConversationId(clientId, businessId);
    if (!conversationId) {
      return null;
    }
    return this.getCacheStateByConversationId(conversationId);
  }

  async setCacheState(clientId: number, businessId: number, state: ConversationCacheState): Promise<void> {
    await this.setActiveConversationId(clientId, businessId, state.conversationId);
    await this.setCacheStateByConversationId(state.conversationId, state);
  }

  async getCacheStateByConversationId(conversationId: number): Promise<ConversationCacheState | null> {
    const state = this.states.get(this.conversationKey(conversationId));
    return state ? this.cloneState(state) : null;
  }

  async setCacheStateByConversationId(conversationId: number, state: ConversationCacheState): Promise<void> {
    this.states.set(this.conversationKey(conversationId), this.cloneState(state));
  }

  async getActiveConversationId(clientId: number, businessId: number): Promise<number | null> {
    return this.activeConversationIds.get(this.key(clientId, businessId)) || null;
  }

  async setActiveConversationId(clientId: number, businessId: number, conversationId: number): Promise<void> {
    this.activeConversationIds.set(this.key(clientId, businessId), conversationId);
  }

  async acquireLock(clientId: number, businessId: number): Promise<boolean> {
    this.lockRequests.push({ clientId, businessId });
    const key = this.key(clientId, businessId);
    if (this.lockedKeys.has(key)) {
      return false;
    }
    this.lockedKeys.add(key);
    return true;
  }

  async releaseLock(clientId: number, businessId: number): Promise<void> {
    this.releasedLocks.push({ clientId, businessId });
    this.lockedKeys.delete(this.key(clientId, businessId));
  }

  setLocked(clientId: number, businessId: number): void {
    this.lockedKeys.add(this.key(clientId, businessId));
  }

  async setTakeoverCancellation(businessId: number, clientId: number, conversationId: number): Promise<void> {
    this.cancelledTakeovers.add(this.takeoverKey(businessId, clientId, conversationId));
  }

  async clearTakeoverCancellation(businessId: number, clientId: number, conversationId: number): Promise<void> {
    this.cancelledTakeovers.delete(this.takeoverKey(businessId, clientId, conversationId));
  }

  async isTakeoverCancelled(businessId: number, clientId: number, conversationId: number): Promise<boolean> {
    return this.cancelledTakeovers.has(this.takeoverKey(businessId, clientId, conversationId));
  }

  private key(clientId: number, businessId: number): string {
    return `${clientId}:${businessId}`;
  }

  private takeoverKey(businessId: number, clientId: number, conversationId: number): string {
    return `${businessId}:${clientId}:${conversationId}`;
  }

  private conversationKey(conversationId: number): string {
    return `${conversationId}`;
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
