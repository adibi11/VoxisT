import { ConversationCacheState } from "../../dataClients/Types/messageTypes";



interface IBusinessAction {
    executeAction(ConversationCacheState: ConversationCacheState): Promise<void>;
}