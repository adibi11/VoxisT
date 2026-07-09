-- Add a claimable in-progress state for scheduled follow-up processing.
ALTER TYPE "FollowUpStatus" ADD VALUE 'PROCESSING';

-- Persist routing context on conversations so scheduled services can enqueue outbound jobs
-- without depending on cache-only channel/provider data.
ALTER TABLE "Conversation"
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'whatsapp',
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'twilio';
