import { describe, expect, it, vi } from "vitest";
import { OpenAIDocumentVisionClient } from "../../src/Documents/Vision/OpenAIDocumentVisionClient";
import { extractionInstructions } from "../../src/Documents/Vision/DocumentVisionPrompts";

const richSchema = {
  expectedDocumentType: "תלוש שכר",
  schemaName: "תלוש שכר V1",
  fields: [{
    id: "net_salary", label: "שכר נטו", type: "CURRENCY" as const, required: true,
    description: "Employee net salary after deductions",
    aliases: ["נטו", "לתשלום"], formatHint: "Israeli shekels", examples: [14500]
  }]
};
const answer = {
  documentMatch: { matches: true, detectedType: "תלוש שכר" },
  fields: { net_salary: { value: 14500, status: "EXTRACTED" } }
};
function setup() {
  const create = vi.fn().mockResolvedValue({ output_text: JSON.stringify(answer), _request_id: "req-safe" });
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
  return { create, logger, client: new OpenAIDocumentVisionClient(logger, { responses: { create } } as any) };
}

describe("OpenAIDocumentVisionClient language-aware prompts", () => {
  it("sends Hebrew/RTL rules and rich field semantics without changing output shape", async () => {
    const { client, create } = setup();
    await expect(client.extract({
      filename: "salary.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-test"), language: "he"
    }, richSchema)).resolves.toEqual(answer);
    const request = create.mock.calls[0][0];
    expect(request.instructions).toBe(extractionInstructions("he"));
    expect(request.instructions).toContain("right-to-left");
    expect(request.instructions).toContain("ברוטו");
    expect(request.instructions).toContain("DD/MM/YYYY");
    expect(request.input[0].content[0].text).toContain("Employee net salary after deductions");
    expect(request.input[0].content[0].text).toContain("לתשלום");
    expect(request.input[0].content[0].text).toContain("Israeli shekels");
  });

  it("uses English-oriented rules while allowing mixed-language content", async () => {
    const { client, create } = setup();
    await client.extract({
      filename: "salary.png", mimeType: "image/png", bytes: Buffer.from("image"), language: "en"
    }, { ...richSchema, expectedDocumentType: "Payslip", schemaName: "Payslip V1" });
    const request = create.mock.calls[0][0];
    expect(request.instructions).toBe(extractionInstructions("en"));
    expect(request.instructions).toContain("left-to-right");
    expect(request.instructions).toContain("mixed-language");
    expect(request.instructions).not.toContain("Hebrew is read right-to-left");
  });

  it("logs request metadata but not extracted values", async () => {
    const { client, logger } = setup();
    await client.extract({
      filename: "salary.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-test"), language: "he"
    }, richSchema);
    const logs = JSON.stringify(logger.info.mock.calls);
    expect(logs).toContain("net_salary");
    expect(logs).toContain("req-safe");
    expect(logs).not.toContain("14500");
  });
});
