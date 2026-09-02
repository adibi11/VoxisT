import { describe, expect, it } from "vitest";
import { CaseFollowUpChannelDecider } from "../../src/Voice/Domain/CaseFollowUpChannelDecider";

describe("CaseFollowUpChannelDecider", () => {
  const decider = new CaseFollowUpChannelDecider();
  const now = new Date("2026-08-23T10:00:00Z");

  it("uses the first successful follow-up as the baseline when no interaction exists", () => {
    expect(decider.decide({
      now,
      voiceEnabled: true,
      voiceConfigured: true,
      thresholdDays: 1,
      lastBorrowerInteractionAt: null,
      firstSuccessfulFollowUpAt: new Date("2026-08-22T10:00:00Z")
    }).channel).toBe("voice");
  });

  it("does not use case age when no successful follow-up baseline exists", () => {
    expect(decider.decide({
      now,
      voiceEnabled: true,
      voiceConfigured: true,
      thresholdDays: 1,
      lastBorrowerInteractionAt: null,
      firstSuccessfulFollowUpAt: null
    })).toEqual({ channel: "sms", reason: "NO_ESCALATION_BASELINE" });
  });

  it("prefers the latest borrower interaction over an older successful follow-up", () => {
    expect(decider.decide({
      now,
      voiceEnabled: true,
      voiceConfigured: true,
      thresholdDays: 1,
      lastBorrowerInteractionAt: new Date("2026-08-23T09:00:00Z"),
      firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00Z")
    }).channel).toBe("sms");
  });

  it("does not let an interaction predating the first follow-up trigger immediate escalation", () => {
    expect(decider.decide({
      now,
      voiceEnabled: true,
      voiceConfigured: true,
      thresholdDays: 1,
      lastBorrowerInteractionAt: new Date("2026-08-20T10:00:00Z"),
      firstSuccessfulFollowUpAt: new Date("2026-08-23T09:00:00Z")
    }).channel).toBe("sms");
  });

  it("suppresses another call while a previous provider submission is unresolved", () => {
    expect(decider.decide({
      now,
      voiceEnabled: true,
      voiceConfigured: true,
      thresholdDays: 1,
      lastBorrowerInteractionAt: null,
      firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00Z"),
      voiceSubmissionUnresolved: true
    })).toEqual({ channel: "sms", reason: "VOICE_SUBMISSION_UNRESOLVED" });
  });
});

describe("business-local escalation days", () => {
  it("selects voice on the next local follow-up day even when 24 hours have not elapsed", () => {
    expect(new CaseFollowUpChannelDecider().decide({
      now: new Date("2026-03-27T06:00:00.000Z"),
      timezone: "Asia/Jerusalem",
      voiceEnabled: true,
      voiceConfigured: true,
      thresholdDays: 1,
      lastBorrowerInteractionAt: null,
      firstSuccessfulFollowUpAt: new Date("2026-03-26T20:00:00.000Z")
    }).channel).toBe("voice");
  });
});
