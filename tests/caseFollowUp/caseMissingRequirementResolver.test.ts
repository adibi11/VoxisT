import { describe, expect, it } from "vitest";
import {
  CaseMissingRequirementResolver
} from "../../src/CaseFollowUp/CaseMissingRequirementResolver";
import { CaseFollowUpRequirementRecord } from "../../src/CaseFollowUp/caseFollowUpTypes";

const now = new Date("2026-08-23T12:00:00.000Z");

function requirement(
  id: number,
  options: Partial<CaseFollowUpRequirementRecord> & {
    statuses?: Array<CaseFollowUpRequirementRecord["documents"][number]["status"]>;
    documentCreatedAt?: Date;
  } = {}
): CaseFollowUpRequirementRecord {
  return {
    id,
    label: options.label === undefined ? `Requirement ${id}` : options.label,
    required: options.required ?? true,
    schemaName: options.schemaName ?? "Schema name",
    documentTypeName: options.documentTypeName ?? "Document type",
    documents: options.statuses?.map((status) => ({
      status,
      createdAt: options.documentCreatedAt ?? now
    })) ?? options.documents ?? []
  };
}

describe("CaseMissingRequirementResolver", () => {
  const resolver = new CaseMissingRequirementResolver({ pendingUploadFreshMs: 24 * 60 * 60 * 1000 });

  it("marks a required specification without a document unresolved", () => {
    expect(resolver.resolve([requirement(1)], now)).toEqual([
      { specificationId: 1, label: "Requirement 1" }
    ]);
  });

  it("ignores optional specifications", () => {
    expect(resolver.resolve([requirement(1, { required: false })], now)).toEqual([]);
  });

  it("keeps same-schema specifications independent and prefers each specification label", () => {
    const missing = resolver.resolve([
      requirement(1, { label: "Payslip — May", schemaName: "Payslip" }),
      requirement(2, { label: "Payslip — June", schemaName: "Payslip", statuses: ["EXTRACTED"] }),
      requirement(3, { label: "Payslip — July", schemaName: "Payslip" })
    ], now);
    expect(missing).toEqual([
      { specificationId: 1, label: "Payslip — May" },
      { specificationId: 3, label: "Payslip — July" }
    ]);
  });

  it("falls back from a blank specification label to schema and then document type", () => {
    expect(resolver.resolve([
      requirement(1, { label: " ", schemaName: "Bank statement" }),
      requirement(2, { label: null, schemaName: "", documentTypeName: "Tax return" })
    ], now).map((item) => item.label)).toEqual(["Bank statement", "Tax return"]);
  });

  it.each(["FAILED", "NEEDS_REVIEW"] as const)(
    "keeps %s attempts unresolved",
    (status) => {
      expect(resolver.resolve([requirement(1, { statuses: [status] })], now)).toHaveLength(1);
    }
  );

  it.each(["UPLOADED", "PROCESSING"] as const)(
    "suppresses an in-flight %s attempt",
    (status) => {
      expect(resolver.resolve([requirement(1, { statuses: [status] })], now)).toEqual([]);
    }
  );

  it.each(["EXTRACTED", "VERIFIED"] as const)(
    "treats %s as satisfied for reminder purposes",
    (status) => {
      expect(resolver.resolve([
        requirement(1, { statuses: ["FAILED", status] })
      ], now)).toEqual([]);
    }
  );

  it("suppresses a fresh PENDING_UPLOAD but not an abandoned one", () => {
    expect(resolver.resolve([
      requirement(1, {
        statuses: ["PENDING_UPLOAD"],
        documentCreatedAt: new Date("2026-08-23T11:00:00.000Z")
      })
    ], now)).toEqual([]);
    expect(resolver.resolve([
      requirement(1, {
        statuses: ["PENDING_UPLOAD"],
        documentCreatedAt: new Date("2026-08-22T11:59:59.000Z")
      })
    ], now)).toHaveLength(1);
  });

  it("does not let one satisfied same-schema specification satisfy another", () => {
    const missing = resolver.resolve([
      requirement(1, { schemaName: "Payslip", statuses: ["EXTRACTED"] }),
      requirement(2, { schemaName: "Payslip" })
    ], now);
    expect(missing.map((item) => item.specificationId)).toEqual([2]);
  });
});
