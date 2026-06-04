import { describe, expect, it } from "vitest";
import { SecurityError, assertSafeRequestUrl } from "../src/index.js";

describe("SSRF safety", () => {
  it("blocks localhost by default", async () => {
    await expect(assertSafeRequestUrl("http://localhost:3000")).rejects.toBeInstanceOf(SecurityError);
    await expect(assertSafeRequestUrl("http://127.0.0.1:3000")).rejects.toBeInstanceOf(SecurityError);
  });

  it("allows localhost when explicitly enabled", async () => {
    await expect(assertSafeRequestUrl("http://localhost:3000", { allowLocalhost: true })).resolves.toBe("http://localhost:3000/");
  });

  it("blocks unsupported protocols", async () => {
    await expect(assertSafeRequestUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SecurityError);
  });
});
