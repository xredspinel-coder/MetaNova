import { describe, expect, it } from "vitest";
import { createPreviewCard, parseMetadata } from "../src/index.js";

const ARTICLE_HTML = `
<!doctype html>
<html>
  <head>
    <title>Fallback Title</title>
    <link rel="canonical" href="/stories/metanova">
    <link rel="icon" href="/favicon.ico">
    <meta name="description" content="Fallback description">
    <meta property="og:type" content="article">
    <meta property="og:title" content="MetaNova launch">
    <meta property="og:description" content="A metadata engine for link previews.">
    <meta property="og:site_name" content="MetaNova Labs">
    <meta property="og:image" content="/images/cover.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="article:published_time" content="2026-06-04T08:00:00Z">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="/images/twitter.jpg">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": "Structured headline",
        "dateModified": "2026-06-05T10:00:00Z",
        "author": { "@type": "Person", "name": "A. Writer" },
        "publisher": { "@type": "Organization", "name": "MetaNova Labs" },
        "image": {
          "@type": "ImageObject",
          "url": "/images/schema.jpg",
          "width": 1000,
          "height": 1000
        }
      }
    </script>
  </head>
  <body>
    <img src="/images/body-small.png" width="120" height="80" alt="Small inline image">
  </body>
</html>
`;

describe("parseMetadata", () => {
  it("extracts and normalizes metadata from common page sources", () => {
    const metadata = parseMetadata(ARTICLE_HTML, "https://example.com/base/page");

    expect(metadata.ok).toBe(true);
    expect(metadata.type).toBe("article");
    expect(metadata.title).toBe("MetaNova launch");
    expect(metadata.description).toBe("A metadata engine for link previews.");
    expect(metadata.siteName).toBe("MetaNova Labs");
    expect(metadata.canonicalUrl).toBe("https://example.com/stories/metanova");
    expect(metadata.confidence).toBeGreaterThan(90);
    expect(metadata.completeness).toBeGreaterThan(80);
    expect(metadata.bestImage).toBe("https://example.com/images/cover.jpg");
    expect(metadata.images[0].source).toBe("openGraph");
    expect(metadata.article?.publishedTime).toBe("2026-06-04T08:00:00Z");
    expect(metadata.article?.modifiedTime).toBe("2026-06-05T10:00:00Z");
    expect(metadata.author?.name).toBe("A. Writer");
    expect(metadata.favicons[0].url).toBe("https://example.com/favicon.ico");
    expect(metadata.diagnostics.sourcesUsed).toEqual(expect.arrayContaining(["openGraph", "twitter", "jsonLd", "html", "media"]));
  });

  it("creates a compact preview card", () => {
    const metadata = parseMetadata(ARTICLE_HTML, "https://example.com/base/page");
    const card = createPreviewCard(metadata);

    expect(card).toEqual({
      title: "MetaNova launch",
      description: "A metadata engine for link previews.",
      image: "https://example.com/images/cover.jpg",
      url: "https://example.com/stories/metanova",
      siteName: "MetaNova Labs",
      type: "article",
      domain: "example.com",
      author: "A. Writer",
      confidence: metadata.confidence
    });
  });
});
