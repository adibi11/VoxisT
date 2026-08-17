import { describe, expect, it, vi } from "vitest";
import {
  createCaseCommentHandler,
  getCaseCommentsHandler,
  isValidCreateCaseCommentRequest
} from "../../src/Api/routes/caseRoutes";
import { CaseRepository } from "../../src/dataClients/SqlClient/Repositories/CaseRepo/CaseRepository";
import { NullLogger } from "../../src/logging/logger";

const firstCreatedAt = new Date("2026-08-16T08:00:00.000Z");
const secondCreatedAt = new Date("2026-08-16T09:00:00.000Z");

function commentRow(id = 1, createdAt = firstCreatedAt) {
  return {
    id,
    caseId: 20,
    authorUserId: 9,
    content: "Client replied",
    createdAt,
    updatedAt: createdAt,
    author: { id: 9, displayName: "Ada Advisor", email: "ada@example.com" }
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    params: { caseId: "20" },
    body: { content: "  Client replied  " },
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
    json: vi.fn((body: unknown) => { res.body = body; return res; })
  };
  return res;
}

function database(caseRepository: Record<string, unknown>) {
  return { caseRepository } as any;
}

describe("Case comments", () => {
  it("allows an authenticated user to create a comment on an accessible Case", async () => {
    const createComment = vi.fn().mockResolvedValue({
      id: 1,
      caseId: 20,
      content: "Client replied",
      createdAt: firstCreatedAt.toISOString(),
      updatedAt: firstCreatedAt.toISOString(),
      author: { id: 9, displayName: "Ada Advisor", email: "ada@example.com" }
    });
    const res = response();

    await createCaseCommentHandler(database({ createComment }), new NullLogger())(
      request(), res, vi.fn()
    );

    expect(createComment).toHaveBeenCalledWith(7, 20, 9, { content: "Client replied" });
    expect(res.statusCode).toBe(201);
    expect(res.body.author.id).toBe(9);
  });

  it("derives the author from authentication and ignores request identity fields", async () => {
    const createComment = vi.fn().mockResolvedValue({ ...commentRow(), createdAt: firstCreatedAt.toISOString(), updatedAt: firstCreatedAt.toISOString() });
    const res = response();

    await createCaseCommentHandler(database({ createComment }), new NullLogger())(
      request({ body: { content: "Hello", authorId: 777, authorUserId: 888, businessId: 999 } }),
      res,
      vi.fn()
    );

    expect(createComment).toHaveBeenCalledWith(7, 20, 9, { content: "Hello" });
  });

  it.each([undefined, null, {}, { content: 12 }, { content: "   " }, { content: "x".repeat(5001) }])(
    "rejects an empty or invalid comment (%#)",
    (body) => {
      expect(isValidCreateCaseCommentRequest(body as any)).toBe(false);
    }
  );

  it("retrieves comments for an accessible Case", async () => {
    const comments = [{ ...commentRow(), createdAt: firstCreatedAt.toISOString(), updatedAt: firstCreatedAt.toISOString() }];
    const getComments = vi.fn().mockResolvedValue(comments);
    const res = response();

    await getCaseCommentsHandler(database({ getComments }), new NullLogger())(request(), res, vi.fn());

    expect(getComments).toHaveBeenCalledWith(7, 20);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(comments);
  });

  it("returns comments in deterministic chronological order", async () => {
    let orderBy: unknown;
    const repository = new CaseRepository({
      case: { findFirst: vi.fn().mockResolvedValue({ id: 20 }) },
      caseComment: {
        findMany: vi.fn(async (args: any) => {
          orderBy = args.orderBy;
          return [commentRow(1, firstCreatedAt), commentRow(2, secondCreatedAt)];
        })
      }
    } as any);

    const comments = await repository.getComments(7, 20);

    expect(orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(comments?.map((comment) => comment.id)).toEqual([1, 2]);
  });

  it("does not read comments for a Case from another business", async () => {
    const findMany = vi.fn();
    const repository = new CaseRepository({
      case: { findFirst: vi.fn().mockResolvedValue(null) },
      caseComment: { findMany }
    } as any);

    expect(await repository.getComments(7, 20)).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("does not add a comment to a Case from another business", async () => {
    const create = vi.fn();
    const repository = new CaseRepository({
      case: { findFirst: vi.fn().mockResolvedValue(null) },
      caseComment: { create }
    } as any);

    expect(await repository.createComment(7, 20, 9, { content: "Hello" })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("handles a nonexistent Case with the existing 404 convention", async () => {
    const createRes = response();
    await createCaseCommentHandler(database({ createComment: vi.fn().mockResolvedValue(null) }), new NullLogger())(
      request({ params: { caseId: "999" } }), createRes, vi.fn()
    );
    expect(createRes.statusCode).toBe(404);
    expect(createRes.body).toEqual({ code: "NOT_FOUND", message: "Case not found" });

    const listRes = response();
    await getCaseCommentsHandler(database({ getComments: vi.fn().mockResolvedValue(null) }), new NullLogger())(
      request({ params: { caseId: "999" } }), listRes, vi.fn()
    );
    expect(listRes.statusCode).toBe(404);
    expect(listRes.body).toEqual({ code: "NOT_FOUND", message: "Case not found" });
  });
});