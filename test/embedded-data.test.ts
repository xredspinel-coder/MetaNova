import { describe, expect, it } from "vitest";
import { extractEmbeddedData, parseMetadata } from "../src/index.js";

describe("embedded data extraction", () => {
  it("extracts metadata from Next.js __NEXT_DATA__ pages", () => {
    const metadata = parseMetadata(`
      <script id="__NEXT_DATA__" type="application/json">
        {
          "props": {
            "pageProps": {
              "post": {
                "title": "Next.js embedded title",
                "description": "Metadata from a Next.js payload.",
                "author": { "name": "Next Author" },
                "datePublished": "2026-06-04T09:00:00Z",
                "image": { "url": "/next-cover.jpg", "width": 1200, "height": 630 }
              }
            }
          }
        }
      </script>
    `, "https://example.com/next");

    expect(metadata.title).toBe("Next.js embedded title");
    expect(metadata.description).toBe("Metadata from a Next.js payload.");
    expect(metadata.author?.name).toBe("Next Author");
    expect(metadata.bestImage).toBe("https://example.com/next-cover.jpg");
    expect(metadata.diagnostics.sourcesUsed).toEqual(expect.arrayContaining(["embeddedData", "nextData"]));
    expect(metadata.diagnostics.trace).toContain("parsed embedded application data");
  });

  it("does not treat nested media urls as canonical page urls", () => {
    const metadata = parseMetadata(`
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"post":{"title":"Media URL is not canonical","image":{"url":"/image-only.jpg","width":1200,"height":630}}}}}
      </script>
    `, "https://example.com/post");

    expect(metadata.canonicalUrl).toBeUndefined();
    expect(metadata.bestImage).toBe("https://example.com/image-only.jpg");
  });

  it("extracts application/json blobs and window initial state", () => {
    const embedded = extractEmbeddedData(`
      <script type="application/json" id="payload">{"title":"JSON blob title","image":"/blob.jpg"}</script>
      <script>window.__PRELOADED_STATE__ = {"article":{"headline":"Preloaded title","coverImage":"/preloaded.jpg"}}</script>
    `);

    expect(embedded.items.map((item) => item.source)).toEqual(expect.arrayContaining(["applicationJson", "preloadedState"]));
  });
});
