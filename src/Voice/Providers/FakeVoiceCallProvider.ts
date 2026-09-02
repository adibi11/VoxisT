import { createHash } from "node:crypto";
import { IVoiceCallProvider, StartVoiceCallInput, StartVoiceCallResult } from "./VoiceCallProvider";

export class FakeVoiceCallProvider implements IVoiceCallProvider {
  readonly provider = "fake";
  readonly calls: StartVoiceCallInput[] = [];

  async startCall(input: StartVoiceCallInput): Promise<StartVoiceCallResult> {
    this.calls.push(input);
    const suffix = createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 16);
    return { providerInteractionId: `fake-${suffix}`, status: "accepted" };
  }
}
