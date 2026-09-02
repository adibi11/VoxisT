export type CaseFollowUpDispatchDecision = {
  channel: "sms" | "voice";
  reason: string;
};

export type CaseFollowUpChannelDecisionInput = {
  now: Date;
  timezone: string;
  voiceEnabled: boolean;
  voiceConfigured: boolean;
  thresholdDays: number | null;
  lastBorrowerInteractionAt: Date | null;
  firstSuccessfulFollowUpAt: Date | null;
  voiceSubmissionUnresolved?: boolean;
};

export class CaseFollowUpChannelDecider {
  decide(input: CaseFollowUpChannelDecisionInput): CaseFollowUpDispatchDecision {
    if (!input.voiceEnabled) return { channel: "sms", reason: "VOICE_DISABLED" };
    if (!input.voiceConfigured) return { channel: "sms", reason: "VOICE_NOT_CONFIGURED" };
    if (input.voiceSubmissionUnresolved) {
      return { channel: "sms", reason: "VOICE_SUBMISSION_UNRESOLVED" };
    }
    if (!input.thresholdDays || input.thresholdDays < 1) {
      return { channel: "sms", reason: "VOICE_THRESHOLD_INVALID" };
    }
    const baseline = latest(input.lastBorrowerInteractionAt, input.firstSuccessfulFollowUpAt);
    if (!baseline) return { channel: "sms", reason: "NO_ESCALATION_BASELINE" };
    const elapsedLocalDays = localDayNumber(input.now, input.timezone) - localDayNumber(baseline, input.timezone);
    return elapsedLocalDays >= input.thresholdDays
      ? { channel: "voice", reason: "VOICE_THRESHOLD_REACHED" }
      : { channel: "sms", reason: "VOICE_THRESHOLD_NOT_REACHED" };
  }
}

function localDayNumber(value: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const number = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(number("year"), number("month") - 1, number("day")) / 86_400_000;
}

function latest(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}
