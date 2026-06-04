import { describe, expect, it } from "vitest";
import { fetchMetadata } from "../src/index.js";

describe("direct media URLs", () => {
  it("detects direct image responses and reads PNG dimensions", async () => {
    const png1x1 = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01
    ]);

    const metadata = await fetchMetadata("http://127.0.0.1/image.png", {
      allowLocalhost: true,
      fetch: async () => new Response(png1x1, {
        status: 200,
        headers: { "content-type": "image/png" }
      })
    });

    expect(metadata.type).toBe("image");
    expect(metadata.bestImage).toBe("http://127.0.0.1/image.png");
    expect(metadata.images[0]).toMatchObject({ width: 1, height: 1, source: "direct" });
    expect(metadata.diagnostics.trace).toContain("detected direct image");
  });
});
