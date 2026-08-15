import { describe, expect, it } from "vitest";
import { SchemaRepository } from "../../src/dataClients/SqlClient/Repositories/SchemaRepo/SchemaRepository";
import {
  isValidCreateBusinessDocumentTypeRequest,
  isValidCreateBusinessSchemaRequest
} from "../../src/Api/routes/caseRoutes";

describe("SchemaRepository", () => {
  it("creates a business-owned custom schema for an existing document type", async () => {
    let createData: any;
    const prisma = {
      documentType: {
        findFirst: async ({ where }: any) =>
          where.id === 4 ? { id: 4, name: "Payslip", category: "Income" } : null
      },
      schema: {
        create: async ({ data }: any) => {
          createData = data;
          return {
            id: 9, businessId: 7,
            ...data,
            documentType: { id: 4, name: "Payslip", category: "Income" }
          };
        }
      }
    };
    const repository = new SchemaRepository(prisma as any);

    const result = await repository.createBusinessSchema(7, {
      documentTypeId: 4,
      name: "Israeli Payslip",
      version: 1,
      requirementSchema: { fields: [] }
    });

    expect(createData).toMatchObject({
      business: { connect: { id: 7 } },
      documentType: { connect: { id: 4 } },
      name: "Israeli Payslip",
      version: 1,
      isCustom: true
    });
    expect(result).toMatchObject({
      id: 9,
      businessId: 7,
      isCustom: true,
      documentType: { id: 4, name: "Payslip", category: "Income" }
    });
  });

  it("does not create a schema when the document type does not exist", async () => {
    let createCalled = false;
    const repository = new SchemaRepository({
      documentType: { findFirst: async () => null },
      schema: { create: async () => { createCalled = true; } }
    } as any);

    const result = await repository.createBusinessSchema(7, {
      documentTypeId: 404,
      name: "Missing type",
      version: 1,
      requirementSchema: {}
    });

    expect(result).toBeNull();
    expect(createCalled).toBe(false);
  });
});

describe("custom schema request validation", () => {
  it("accepts a non-empty name, positive IDs/version, and JSON object", () => {
    expect(isValidCreateBusinessSchemaRequest({
      documentTypeId: 4,
      name: "Payslip",
      version: 1,
      requirementSchema: { fields: [] }
    })).toBe(true);
  });

  it.each([
    { documentTypeId: 0, name: "Payslip", version: 1, requirementSchema: {} },
    { documentTypeId: 4, name: " ", version: 1, requirementSchema: {} },
    { documentTypeId: 4, name: "Payslip", version: 0, requirementSchema: {} },
    { documentTypeId: 4, name: "Payslip", version: 1, requirementSchema: [] },
    { documentTypeId: 4, name: "Payslip", version: 1, requirementSchema: null }
  ])("rejects invalid request %#", (request) => {
    expect(isValidCreateBusinessSchemaRequest(request as any)).toBe(false);
  });
});
describe("custom document types", () => {
  it("creates a document type owned by the business", async () => {
    let createData: any;
    const now = new Date("2026-08-10T12:00:00.000Z");
    const repository = new SchemaRepository({
      documentType: {
        create: async ({ data }: any) => {
          createData = data;
          return { id: 5, businessId: 7, ...data, createdAt: now, updatedAt: now };
        }
      }
    } as any);

    const result = await repository.createBusinessDocumentType(7, {
      name: "Payslip",
      category: "Income"
    });

    expect(createData).toEqual({
      business: { connect: { id: 7 } },
      name: "Payslip",
      category: "Income",
      isCustom: true
    });
    expect(result).toMatchObject({
      id: 5,
      businessId: 7,
      category: "Income",
      isCustom: true
    });
  });

  it("lists only custom document types for the requested business", async () => {
    let findManyArgs: any;
    const now = new Date("2026-08-10T12:00:00.000Z");
    const repository = new SchemaRepository({
      documentType: {
        findMany: async (args: any) => {
          findManyArgs = args;
          return [{
            id: 5,
            businessId: 7,
            name: "Payslip",
            category: "Income",
            isCustom: true,
            createdAt: now,
            updatedAt: now
          }];
        }
      }
    } as any);

    const result = await repository.getBusinessDocumentTypes(7);

    expect(findManyArgs.where).toEqual({ businessId: 7, isCustom: true });
    expect(result).toHaveLength(1);
    expect(result[0].businessId).toBe(7);
  });

  it.each([
    { name: "" },
    { name: " " },
    { name: "Payslip", category: 42 }
  ])("rejects an invalid document type request %#", (request) => {
    expect(isValidCreateBusinessDocumentTypeRequest(request)).toBe(false);
  });
});
