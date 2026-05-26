import { ICacheManager } from "../../src/dataClients/CacheClient/cacheInterface";
import { ConversationCacheState } from "../../src/dataClients/Types/messageTypes";

export class FakeCacheManager implements ICacheManager {
  public states = new Map<string, ConversationCacheState>();
  public lockedKeys = new Set<string>();
  public lockRequests: { clientId: number; businessId: number }[] = [];
  public releasedLocks: { clientId: number; businessId: number }[] = [];

  constructor(initialStates?: {
    clientId: number;
    businessId: number;
    state: ConversationCacheState;
  }[]) {
    for (const item of initialStates || []) {
      this.states.set(this.key(item.clientId, item.businessId), this.cloneState(item.state));
    }
  }

  async getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null> {
    const state = this.states.get(this.key(clientId, businessId));
    return state ? this.cloneState(state) : null;
  }

  async setCacheState(clientId: number, businessId: number, state: ConversationCacheState): Promise<void> {
    this.states.set(this.key(clientId, businessId), this.cloneState(state));
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

  private key(clientId: number, businessId: number): string {
    return `${clientId}:${businessId}`;
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
