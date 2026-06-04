import { describe, expect, it } from "vitest";
import { calculateCompleteness, calculateConfidence, parseMetadata } from "../src/index.js";

describe("ConfidenceEngine", () => {
  it("calculates 0-100 confidence and completeness", () => {
    const metadata = parseMetadata(`
      <link rel="canonical" href="/canonical">
      <meta property="og:title" content="Strong title for confidence">
      <meta property="og:description" content="Strong description with enough detail for a useful preview card.">
      <meta property="og:image" content="/social-preview.jpg">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","author":{"name":"Writer"}}</script>
    `, "https://example.com/post");

    expect(metadata.confidence).toBeGreaterThanOrEqual(90);
    expect(metadata.completeness).toBeGreaterThanOrEqual(80);
    expect(metadata.diagnostics.confidenceBreakdown).toMatchObject({
      structuredData: 100
    });
    expect(metadata.diagnostics.confidenceBreakdown?.title).toBeGreaterThan(0);
    expect(metadata.diagnostics.confidenceBreakdown?.image).toBeGreaterThan(0);
  });

  it("exposes standalone engine functions", () => {
    const confidence = calculateConfidence({
      title: "Standalone title",
      description: "Standalone description with useful details.",
      bestImage: { url: "https://example.com/cover.jpg", kind: "image", source: "openGraph", score: 95 },
      canonicalUrl: "https://example.com/post",
      hasStructuredData: true,
      rawSources: {
        html: { favicons: [], alternates: [] },
        openGraph: { images: [], videos: [], audio: [], raw: {} },
        twitter: { images: [], videos: [], raw: {} },
        jsonLd: { nodes: [{}], warnings: [] },
        embeddedData: { items: [], warnings: [] },
        oEmbed: { links: [], data: [] },
        images: [],
        videos: [],
        audio: [],
        adapters: [{ source: "testAdapter", title: "Adapter title" }],
        plugins: []
      },
      sourcesUsed: ["openGraph", "testAdapter"],
      warnings: []
    });
    const completeness = calculateCompleteness({
      title: "Standalone title",
      description: "Standalone description",
      bestImage: { url: "https://example.com/cover.jpg", kind: "image", source: "openGraph" },
      canonicalUrl: "https://example.com/post",
      siteName: "Example",
      author: { name: "Writer" },
      publisher: { name: "Publisher" },
      type: "article",
      publishedTime: "2026-06-04T09:00:00Z",
      mediaCount: 2
    });

    expect(confidence).toBeGreaterThan(85);
    expect(completeness).toBe(100);
  });
});
