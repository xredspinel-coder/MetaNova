import { describe, expect, it } from "vitest";
import { parseMetadata } from "../src/index.js";

describe("source attribution and reliability", () => {
  it("reports important field sources and reliability score", () => {
    const metadata = parseMetadata(`
      <meta property="og:title" content="Source title">
      <meta property="og:description" content="Source description long enough for quality.">
      <meta name="twitter:image" content="/twitter-card.jpg">
      <meta name="twitter:image:width" content="1200">
      <meta name="twitter:image:height" content="630">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","author":{"name":"Source Writer"}}</script>
    `, "https://example.com/source");

    expect(metadata.sources).toMatchObject({
      title: "openGraph",
      description: "openGraph",
      image: "twitter"
    });
    expect(metadata.reliability).toBeGreaterThan(70);
    expect(metadata.diagnostics.adapter?.matched).toBe(false);
  });
});
