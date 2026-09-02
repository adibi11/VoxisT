import type { CaseFollowUpVoiceDependencies } from "../CaseFollowUp/CaseFollowUpWorker";
import { SqlManager } from "../dataClients/SqlClient/SqlManager";
import { PortalAccessService } from "../Portal/PortalAccessService";
import { VoiceCallContextBuilder } from "./Context/VoiceCallContextBuilder";
import { CaseFollowUpChannelDecider } from "./Domain/CaseFollowUpChannelDecider";
import { IVoiceCallProvider } from "./Providers/VoiceCallProvider";

export function createVoiceRuntime(
  sql: SqlManager,
  portalAccess: PortalAccessService,
  provider: IVoiceCallProvider
): CaseFollowUpVoiceDependencies {
  return {
    configuration: sql.voiceConfigurationRepository,
    interactions: sql.voiceInteractionRepository,
    contextBuilder: new VoiceCallContextBuilder(sql.getPrismaClient(), portalAccess),
    provider,
    channelDecider: new CaseFollowUpChannelDecider()
  };
}
