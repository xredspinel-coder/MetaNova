import { describe, expect, it } from "vitest";
import { parseMetadata } from "../src/index.js";
import type { MetaNovaPlugin } from "../src/index.js";

describe("plugins", () => {
  it("allows custom extractors and image scorers", () => {
    const plugin: MetaNovaPlugin = {
      name: "docs-plugin",
      setup(api) {
        api.addExtractor("docs-extractor", () => ({
          source: "docs-extractor",
          title: "Plugin Title",
          images: [
            {
              url: "/plugin-image.png",
              kind: "image",
              source: "plugin",
              width: 400,
              height: 400
            }
          ]
        }));

        api.addImageScorer((image) => (image.source === "plugin" ? 30 : 0));
      }
    };

    const metadata = parseMetadata("<html><head><title>Native Title</title></head></html>", "https://example.com/docs", {
      plugins: [plugin]
    });

    expect(metadata.title).toBe("Plugin Title");
    expect(metadata.bestImage).toBe("https://example.com/plugin-image.png");
    expect(metadata.diagnostics.sourcesUsed).toContain("docs-extractor");
  });
});
