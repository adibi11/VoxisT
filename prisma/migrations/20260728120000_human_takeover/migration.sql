-- AlterEnum
ALTER TYPE "ConversationStatus" ADD VALUE 'humanTakeover';

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'human';

-- AlterEnum
ALTER TYPE "BusinessActivityEventType" ADD VALUE 'CONVERSATION_MESSAGE_RECEIVED';

-- AlterEnum
ALTER TYPE "BusinessActivityAggregateType" ADD VALUE 'CONVERSATION';
