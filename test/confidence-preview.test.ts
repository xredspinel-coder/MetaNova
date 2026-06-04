import { describe, expect, it } from "vitest";
import { createPreviewCard, parseMetadata } from "../src/index.js";

describe("confidence and preview cards", () => {
  it("adds confidence to metadata and preview cards", () => {
    const metadata = parseMetadata(`
      <html>
        <head>
          <title>Fallback Page</title>
          <link rel="canonical" href="/canonical">
          <meta property="og:title" content="Confident Page">
          <meta property="og:description" content="Strong metadata signals.">
          <meta property="og:image" content="/cover-preview.jpg">
          <meta property="og:image:width" content="1200">
          <meta property="og:image:height" content="630">
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"Article","headline":"Confident Page"}
          </script>
        </head>
      </html>
    `, "https://example.com/page");

    const card = createPreviewCard(metadata);

    expect(metadata.confidence).toBeGreaterThan(90);
    expect(metadata.completeness).toBeGreaterThan(70);
    expect(card.confidence).toBe(metadata.confidence);
    expect(card.image).toBe("https://example.com/cover-preview.jpg");
    expect(card.domain).toBe("example.com");
    expect(metadata.diagnostics.selectedImageReason).toContain("og:image");
    expect(metadata.diagnostics.canonicalUrl).toBe("https://example.com/canonical");
  });
});
