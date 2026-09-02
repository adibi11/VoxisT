import { describe, expect, it } from "vitest";
import { readFormConfig } from "../../src/Api/routes/publicFormRoutes";

describe("public lead form configuration", () => {
  it("provides a usable safe default form", () => {
    const config = readFormConfig(null);
    expect(config.title).toBe("Contact us");
    expect(config.fields.map((field) => field.key)).toEqual(["fullName", "email", "phone"]);
  });

  it("keeps valid custom fields and frame origins", () => {
    const config = readFormConfig({
      title: "Get a quote",
      allowedOrigins: ["https://customer.example"],
      fields: [{ key: "fullName", label: "Your name", type: "text", required: true }]
    });
    expect(config).toMatchObject({
      title: "Get a quote",
      allowedOrigins: ["https://customer.example"],
      fields: [{ key: "fullName", required: true }]
    });
  });
});
