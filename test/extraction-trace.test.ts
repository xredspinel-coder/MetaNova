import { describe, expect, it } from "vitest";
import { parseMetadata } from "../src/index.js";

describe("extraction trace", () => {
  it("records major extraction and selection steps", () => {
    const metadata = parseMetadata(`
      <meta property="og:title" content="Trace example">
      <meta property="og:image" content="/trace-card.jpg">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Trace example"}</script>
    `, "https://example.com/trace");

    expect(metadata.diagnostics.trace).toEqual(expect.arrayContaining([
      "validated and normalized URL",
      "parsed Open Graph",
      "parsed JSON-LD"
    ]));
    expect(metadata.diagnostics.trace.some((step) => step.startsWith("selected image from"))).toBe(true);
  });
});
