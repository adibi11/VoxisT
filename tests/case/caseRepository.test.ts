import { describe, expect, it } from "vitest";
import { CaseRepository } from "../../src/dataClients/SqlClient/Repositories/CaseRepo/CaseRepository";
import { isValidCreateCaseRequest } from "../../src/Api/routes/caseRoutes";

const now = new Date("2026-08-11T10:00:00.000Z");

function detailRow() {
  const schema = {
    id: 10,
    businessId: 7,
    documentTypeId: 3,
    name: "Payslip V1",
    version: 1,
    requirementSchema: { fields: [] },
    isCustom: true,
    createdAt: now,
    updatedAt: now,
    documentType: {
      id: 3,
      businessId: 7,
      name: "Payslip",
      category: "Income",
      isCustom: true,
      createdAt: now,
      updatedAt: now
    }
  };
  return {
    id: 20,
    businessId: 7,
    leadId: 4,
    assigneeId: null,
    name: "Mortgage Case",
    status: "IN_PROGRESS",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    lead: {
      id: 4,
      clientId: null,
      name: "Ada Client",
      phoneNumber: "+972500000000",
      client: null
    },
    assignee: null,
    documentSpecifications: [
      { id: 1, caseId: 20, schemaId: 10, required: true, label: "Payslip May", createdAt: now, updatedAt: now, schema, documents: [] },
      { id: 2, caseId: 20, schemaId: 10, required: true, label: "Payslip June", createdAt: now, updatedAt: now, schema, documents: [] }
    ],
    documents: []
  };
}

describe("CaseRepository", () => {
  it("creates a Case and repeated-schema specifications atomically", async () => {
    let specificationRows: any[] = [];
    const tx = {
      lead: { findFirst: async () => ({ id: 4 }) },
      businessUser: { findFirst: async () => ({ id: 1 }) },
      schema: { findMany: async () => [{ id: 10 }] },
      case: {
        create: async () => ({ id: 20 }),
        findFirst: async () => detailRow()
      },
      caseDocumentSpecification: {
        createMany: async ({ data }: any) => {
          specificationRows = data;
          return { count: data.length };
        }
      }
    };
    const repository = new CaseRepository({
      $transaction: async (operation: any) => operation(tx)
    } as any);

    const result = await repository.createCase(7, {
      leadId: 4,
      name: "Mortgage Case",
      documentSpecifications: [
        { schemaId: 10, label: "Payslip May", required: true },
        { schemaId: 10, label: "Payslip June", required: true }
      ]
    });

    expect(result.outcome).toBe("created");
    expect(specificationRows).toHaveLength(2);
    expect(specificationRows.map((row) => row.schemaId)).toEqual([10, 10]);
    expect(result.outcome === "created" && result.case.documents).toEqual([]);
    expect(result.outcome === "created" && result.case.documentSpecifications).toHaveLength(2);
  });

  it("does not create a Case when a requested Schema is inaccessible", async () => {
    let createCalled = false;
    const tx = {
      lead: { findFirst: async () => ({ id: 4 }) },
      schema: { findMany: async () => [] },
      case: { create: async () => { createCalled = true; } }
    };
    const repository = new CaseRepository({
      $transaction: async (operation: any) => operation(tx)
    } as any);

    const result = await repository.createCase(7, {
      leadId: 4,
      name: "Mortgage Case",
      documentSpecifications: [{ schemaId: 99, required: true }]
    });

    expect(result).toEqual({ outcome: "schemas_not_found", schemaIds: [99] });
    expect(createCalled).toBe(false);
  });

  it("scopes list queries and maps derived counts", async () => {
    let where: any;
    const repository = new CaseRepository({
      case: {
        findMany: async (args: any) => {
          where = args.where;
          return [{
            ...detailRow(),
            documentSpecifications: undefined,
            documents: undefined,
            _count: { documentSpecifications: 3, documents: 0 }
          }];
        }
      }
    } as any);

    const result = await repository.listCases(7);

    expect(where).toEqual({ businessId: 7 });
    expect(result[0]).toMatchObject({
      expectedDocuments: 3,
      uploadedDocuments: 0
    });
  });

  it("scopes details lookup by both Case and Business", async () => {
    let where: any;
    const repository = new CaseRepository({
      case: {
        findFirst: async (args: any) => {
          where = args.where;
          return null;
        }
      }
    } as any);

    expect(await repository.getCaseDetails(7, 20)).toBeNull();
    expect(where).toEqual({ id: 20, businessId: 7 });
  });
});

describe("CreateCase request validation", () => {
  it("accepts repeated schema IDs", () => {
    expect(isValidCreateCaseRequest({
      leadId: 4,
      name: "Mortgage Case",
      assigneeId: null,
      documentSpecifications: [
        { schemaId: 10, label: "Payslip May", required: true },
        { schemaId: 10, label: "Payslip June", required: true }
      ]
    })).toBe(true);
  });

  it.each([
    { leadId: 0, name: "Case", documentSpecifications: [] },
    { leadId: 4, name: " ", documentSpecifications: [] },
    { leadId: 4, name: "Case", assigneeId: 0, documentSpecifications: [] },
    { leadId: 4, name: "Case", documentSpecifications: null },
    { leadId: 4, name: "Case", documentSpecifications: [{ schemaId: 0, required: true }] },
    { leadId: 4, name: "Case", documentSpecifications: [{ schemaId: 10, required: "yes" }] }
  ])("rejects invalid request %#", (request) => {
    expect(isValidCreateCaseRequest(request as any)).toBe(false);
  });
});
