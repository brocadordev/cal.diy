import { isAdminApiKey } from "@/lib/api-key";

describe("isAdminApiKey", () => {
  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it("accepts only the configured key", () => {
    process.env.ADMIN_API_KEY = "admin-secret";

    expect(isAdminApiKey("admin-secret")).toBe(true);
    expect(isAdminApiKey("admin-secret-2")).toBe(false);
    expect(isAdminApiKey("")).toBe(false);
    expect(isAdminApiKey(undefined)).toBe(false);
  });

  it("rejects every token when the key is not configured", () => {
    expect(isAdminApiKey("")).toBe(false);
    expect(isAdminApiKey("anything")).toBe(false);
  });
});
