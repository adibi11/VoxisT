import { describe, expect, it } from "vitest";
import { validateInboundAttachment } from "../../src/InboundEmail/InboundEmailAttachmentValidator";

describe("validateInboundAttachment", () => {
  it.each([
    ["application/pdf", [0x25,0x50,0x44,0x46,0x2d]],
    ["image/jpeg", [0xff,0xd8,0xff,0x00]],
    ["image/png", [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]]
  ])("accepts an existing upload type with matching bytes: %s", (contentType, signature) => {
    expect(validateInboundAttachment({ filename: "../safe file", contentType, content: Uint8Array.from(signature) }, 100)?.filename).toBe("safe_file");
  });
  it("rejects unsupported and disguised attachments", () => {
    expect(validateInboundAttachment({ filename: "x.exe", contentType: "application/octet-stream", content: Uint8Array.of(1) })).toBeNull();
    expect(validateInboundAttachment({ filename: "x.pdf", contentType: "application/pdf", content: Uint8Array.of(0x4d,0x5a) })).toBeNull();
  });
  it("enforces the canonical upload size limit", () => {
    expect(validateInboundAttachment({ filename: "x.pdf", contentType: "application/pdf", content: Uint8Array.from([0x25,0x50,0x44,0x46,0x2d,0]) }, 5)).toBeNull();
  });
});
