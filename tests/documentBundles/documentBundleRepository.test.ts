import { describe, expect, it, vi } from "vitest";
import {
  createDocumentBundleHandler,
  getDocumentBundleHandler,
  isValidUpsertDocumentBundleRequest,
  updateDocumentBundleHandler
} from "../../src/Api/routes/documentBundleRoutes";
import { DocumentBundleRepository } from "../../src/dataClients/SqlClient/Repositories/DocumentBundleRepo/DocumentBundleRepository";
import { NullLogger } from "../../src/logging/logger";

const now = new Date("2026-08-17T08:00:00.000Z");

function schema(id: number, businessId = 7) {
  return {
    id,
    businessId,
    documentTypeId: id + 100,
    name: `Schema ${id}`,
    version: 1,
    requirementSchema: { fields: [{ key: "value" }] },
    isCustom: true,
    createdAt: now,
    updatedAt: now,
    documentType: {
      id: id + 100,
      businessId,
      name: `Type ${id}`,
      category: "Identity",
      isCustom: true,
      createdAt: now,
      updatedAt: now
    }
  };
}

function bundleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 30,
    businessId: 7,
    name: "Employee",
    description: "Employment documents",
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 201, bundleId: 30, schemaId: 10, required: true, quantity: 3, label: "Payslip", position: 0, schema: schema(10) },
      { id: 202, bundleId: 30, schemaId: 14, required: false, quantity: 1, label: null, position: 1, schema: schema(14) }
    ],
    ...overrides
  };
}

function requestBody(items = [
  { schemaId: 10, required: true, quantity: 3, label: " Payslip ", position: 0 },
  { schemaId: 14, required: false, position: 1 }
]) {
  return { name: " Employee ", description: " Employment documents ", items };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    params: { bundleId: "30" },
    body: requestBody(),
    header: (name: string) => name === "X-Business-Id" ? "7" : undefined,
    auth: {
      userId: 9,
      platformRole: "user",
      businessIds: [7],
      businessMemberships: [{ businessId: 7, role: "member" }]
    },
    ...overrides
  } as any;
}

function response() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status: vi.fn((statusCode: number) => { res.statusCode = statusCode; return res; }),
    json: vi.fn((body: unknown) => { res.body = body; return res; }),
    send: vi.fn(() => res)
  };
  return res;
}

function transactionalRepository(tx: Record<string, unknown>) {
  return new DocumentBundleRepository({
    $transaction: async (operation: (client: unknown) => unknown) => operation(tx)
  } as any);
}

describe("DocumentBundleRepository", () => {
  it("creates a Bundle from existing Schemas owned by the business", async () => {
    let schemaWhere: any;
    let createData: any;
    const tx = {
      schema: { findMany: async ({ where }: any) => { schemaWhere = where; return [{ id: 10 }, { id: 14 }]; } },
      documentBundle: {
        create: async ({ data }: any) => { createData = data; return bundleRow(); }
      }
    };
    const result = await transactionalRepository(tx).createBundle(7, requestBody());

    expect(schemaWhere).toEqual({ id: { in: [10, 14] }, businessId: 7, isCustom: true });
    expect(createData).toMatchObject({
      businessId: 7,
      name: "Employee",
      description: "Employment documents",
      items: { create: [
        { schemaId: 10, required: true, quantity: 3, label: "Payslip", position: 0 },
        { schemaId: 14, required: false, quantity: 1, label: null, position: 1 }
      ] }
    });
    expect(result.outcome).toBe("success");
  });


  it("defaults omitted item quantity to one", async () => {
    let createData: any;
    const tx = {
      schema: { findMany: async () => [{ id: 10 }] },
      documentBundle: {
        create: async ({ data }: any) => {
          createData = data;
          return bundleRow({ items: [
            { id: 201, bundleId: 30, schemaId: 10, required: true, quantity: 1, label: null, position: 0, schema: schema(10) }
          ] });
        }
      }
    };

    const result = await transactionalRepository(tx).createBundle(7, {
      name: "Employee",
      items: [{ schemaId: 10, required: true, position: 0 }]
    });

    expect(createData.items.create[0].quantity).toBe(1);
    expect(result.outcome === "success" && result.bundle.items[0].quantity).toBe(1);
  });
  it("lists Bundles with ordered items and complete existing Schema DTO data", async () => {
    let args: any;
    const repository = new DocumentBundleRepository({
      documentBundle: { findMany: async (value: any) => { args = value; return [bundleRow()]; } }
    } as any);

    const result = await repository.listBundles(7);

    expect(args.where).toEqual({ businessId: 7 });
    expect(args.include.items.orderBy).toEqual([{ position: "asc" }, { id: "asc" }]);
    expect(result[0].items[0].quantity).toBe(3);
    expect(result[0].items[0].schema).toEqual({
      id: 10,
      businessId: 7,
      isCustom: true,
      documentType: { id: 110, name: "Type 10", category: "Identity" },
      name: "Schema 10",
      version: 1,
      requirementSchema: { fields: [{ key: "value" }] }
    });
  });

  it("gets one tenant-scoped Bundle with complete item and Schema information", async () => {
    let where: any;
    const repository = new DocumentBundleRepository({
      documentBundle: { findFirst: async (args: any) => { where = args.where; return bundleRow(); } }
    } as any);

    const result = await repository.getBundle(7, 30);

    expect(where).toEqual({ id: 30, businessId: 7 });
    expect(result?.items).toHaveLength(2);
    expect(result?.items[1].schema.documentType.name).toBe("Type 14");
  });

  it("updates Bundle metadata", async () => {
    let updateData: any;
    const tx = {
      documentBundle: {
        findFirst: async () => ({ id: 30 }),
        update: async ({ data }: any) => { updateData = data; return bundleRow({ name: "Updated", description: null }); }
      },
      documentBundleItem: { deleteMany: async () => ({ count: 2 }) },
      schema: { findMany: async () => [{ id: 10 }, { id: 14 }] }
    };

    const result = await transactionalRepository(tx).updateBundle(7, 30, {
      ...requestBody(), name: " Updated ", description: " "
    });

    expect(updateData.name).toBe("Updated");
    expect(updateData.description).toBeNull();
    expect(result.outcome).toBe("success");
  });

  it("replaces the Bundle item collection transactionally without updating Schemas", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const update = vi.fn().mockResolvedValue(bundleRow({ items: [
      { id: 203, bundleId: 30, schemaId: 18, required: true, quantity: 2, label: null, position: 0, schema: schema(18) }
    ] }));
    const schemaUpdate = vi.fn();
    const tx = {
      documentBundle: { findFirst: async () => ({ id: 30 }), update },
      documentBundleItem: { deleteMany },
      schema: { findMany: async () => [{ id: 18 }], update: schemaUpdate }
    };

    await transactionalRepository(tx).updateBundle(7, 30, {
      name: "Employee", items: [{ schemaId: 18, required: true, quantity: 2, position: 0 }]
    });

    expect(deleteMany).toHaveBeenCalledWith({ where: { bundleId: 30 } });
    expect(update.mock.calls[0][0].data.items.create).toEqual([
      { schemaId: 18, required: true, quantity: 2, label: null, position: 0 }
    ]);
    expect(schemaUpdate).not.toHaveBeenCalled();
  });

  it("persists reordered Bundle item positions", async () => {
    let itemData: any;
    const tx = {
      documentBundle: {
        findFirst: async () => ({ id: 30 }),
        update: async ({ data }: any) => { itemData = data.items.create; return bundleRow(); }
      },
      documentBundleItem: { deleteMany: async () => ({ count: 2 }) },
      schema: { findMany: async () => [{ id: 10 }, { id: 14 }] }
    };

    await transactionalRepository(tx).updateBundle(7, 30, {
      name: "Employee",
      items: [
        { schemaId: 10, required: true, position: 1 },
        { schemaId: 14, required: true, position: 0 }
      ]
    });

    expect(itemData.map((item: any) => [item.schemaId, item.position])).toEqual([[10, 1], [14, 0]]);
  });

  it("deletes a Bundle scoped by businessId", async () => {
    let where: any;
    const repository = new DocumentBundleRepository({
      documentBundle: { deleteMany: async (args: any) => { where = args.where; return { count: 1 }; } }
    } as any);

    expect(await repository.deleteBundle(7, 30)).toBe(true);
    expect(where).toEqual({ id: 30, businessId: 7 });
  });

  it("deleting a Bundle never deletes referenced Schemas", async () => {
    const schemaDelete = vi.fn();
    const repository = new DocumentBundleRepository({
      documentBundle: { deleteMany: async () => ({ count: 1 }) },
      schema: { delete: schemaDelete, deleteMany: schemaDelete }
    } as any);

    await repository.deleteBundle(7, 30);

    expect(schemaDelete).not.toHaveBeenCalled();
  });

  it("rejects duplicate Schema references in one Bundle", () => {
    expect(isValidUpsertDocumentBundleRequest(requestBody([
      { schemaId: 10, required: true, position: 0 },
      { schemaId: 10, required: false, position: 1 }
    ]))).toBe(false);
  });

  it("rejects a Schema belonging to another Business", async () => {
    const create = vi.fn();
    const tx = {
      schema: { findMany: async () => [{ id: 10 }] },
      documentBundle: { create }
    };

    const result = await transactionalRepository(tx).createBundle(7, requestBody());

    expect(result).toEqual({ outcome: "schemas_not_found", schemaIds: [14] });
    expect(create).not.toHaveBeenCalled();
  });

  it("prevents reading another Business's Bundle", async () => {
    const repository = new DocumentBundleRepository({
      documentBundle: { findFirst: vi.fn().mockResolvedValue(null) }
    } as any);

    expect(await repository.getBundle(7, 30)).toBeNull();
  });

  it("prevents updating another Business's Bundle before replacing items", async () => {
    const deleteMany = vi.fn();
    const tx = {
      documentBundle: { findFirst: vi.fn().mockResolvedValue(null) },
      documentBundleItem: { deleteMany },
      schema: { findMany: vi.fn() }
    };

    const result = await transactionalRepository(tx).updateBundle(7, 30, requestBody());

    expect(result).toEqual({ outcome: "bundle_not_found" });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("prevents deleting another Business's Bundle", async () => {
    const repository = new DocumentBundleRepository({
      documentBundle: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) }
    } as any);

    expect(await repository.deleteBundle(7, 30)).toBe(false);
  });
});

describe("Document Bundle API conventions and validation", () => {
  it("returns the existing 404 convention for a nonexistent Bundle", async () => {
    const res = response();
    await getDocumentBundleHandler({
      documentBundleRepository: { getBundle: vi.fn().mockResolvedValue(null) }
    } as any, new NullLogger())(request(), res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ code: "NOT_FOUND", message: "Document Bundle not found" });
  });

  it("returns the existing 404 convention with missing Schema IDs", async () => {
    const createRes = response();
    await createDocumentBundleHandler({
      documentBundleRepository: {
        createBundle: vi.fn().mockResolvedValue({ outcome: "schemas_not_found", schemaIds: [999] })
      }
    } as any, new NullLogger())(request(), createRes, vi.fn());
    expect(createRes.statusCode).toBe(404);
    expect(createRes.body).toEqual({
      code: "NOT_FOUND",
      message: "One or more Schemas are not accessible",
      schemaIds: [999]
    });

    const updateRes = response();
    await updateDocumentBundleHandler({
      documentBundleRepository: {
        updateBundle: vi.fn().mockResolvedValue({ outcome: "schemas_not_found", schemaIds: [999] })
      }
    } as any, new NullLogger())(request(), updateRes, vi.fn());
    expect(updateRes.statusCode).toBe(404);
  });

  it.each([
    { name: " ", items: [] },
    { name: "x".repeat(121), items: [] },
    { name: "Bundle", description: 4, items: [] },
    { name: "Bundle", items: null },
    { name: "Bundle", items: [{ schemaId: "10", required: true, position: 0 }] },
    { name: "Bundle", items: [{ schemaId: 10, required: "yes", position: 0 }] },
    { name: "Bundle", items: [{ schemaId: 10, required: true, quantity: 0, position: 0 }] },
    { name: "Bundle", items: [{ schemaId: 10, required: true, quantity: 1.5, position: 0 }] },
    { name: "Bundle", items: [{ schemaId: 10, required: true, quantity: 121, position: 0 }] },
    { name: "Bundle", items: [{ schemaId: 10, required: true, position: -1 }] },
    { name: "Bundle", items: [{ schemaId: 10, required: true, label: "x".repeat(201), position: 0 }] }
  ])("rejects invalid Bundle input %#", (body) => {
    expect(isValidUpsertDocumentBundleRequest(body as any)).toBe(false);
  });
});