import { describe, expect, it } from "vitest";
import { fetchMetadata } from "../src/index.js";

describe("browser-like networking", () => {
  it("sends browser-like default headers and allows overrides", async () => {
    const seenHeaders: Record<string, string> = {};
    await fetchMetadata("http://127.0.0.1/page", {
      allowLocalhost: true,
      acceptLanguage: "fr-FR,fr;q=0.9",
      fetch: async (_url, init) => {
        const headers = new Headers(init?.headers);
        headers.forEach((value, key) => {
          seenHeaders[key] = value;
        });

        return new Response("<title>Headers</title>", {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      }
    });

    expect(seenHeaders["user-agent"]).toContain("Mozilla/5.0");
    expect(seenHeaders["accept"]).toContain("text/html");
    expect(seenHeaders["accept-language"]).toBe("fr-FR,fr;q=0.9");
    expect(seenHeaders["accept-encoding"]).toContain("gzip");
    expect(seenHeaders["sec-fetch-mode"]).toBe("navigate");
  });
});
