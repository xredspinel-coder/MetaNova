import { describe, expect, it } from "vitest";
import { scoreImages } from "../src/index.js";
import type { MediaAsset } from "../src/index.js";

describe("scoreImages", () => {
  it("prioritizes reliable, large preview-ready images", () => {
    const images: MediaAsset[] = [
      {
        url: "https://example.com/favicon.ico",
        kind: "favicon",
        source: "favicon",
        width: 32,
        height: 32
      },
      {
        url: "https://example.com/body.png",
        kind: "image",
        source: "html",
        width: 600,
        height: 400
      },
      {
        url: "https://example.com/og.jpg",
        kind: "image",
        source: "openGraph",
        width: 1200,
        height: 630
      }
    ];

    const scored = scoreImages(images);
    expect(scored[0].url).toBe("https://example.com/og.jpg");
    expect(scored[0].score).toBeGreaterThan(scored[1].score ?? 0);
    expect(scored[0].metadata?.scoreReasons).toBeInstanceOf(Array);
  });

  it("penalizes logos, avatars, pixels, and placeholders against cover-like images", () => {
    const images: MediaAsset[] = [
      {
        url: "https://example.com/assets/avatar-logo.png",
        kind: "image",
        source: "html",
        width: 1200,
        height: 630
      },
      {
        url: "https://example.com/assets/cover-preview.jpg",
        kind: "image",
        source: "html",
        width: 1200,
        height: 630
      }
    ];

    const scored = scoreImages(images);

    expect(scored[0].url).toBe("https://example.com/assets/cover-preview.jpg");
    expect(scored[0].score).toBeGreaterThan(scored[1].score ?? 0);
  });

  it("ranks social-preview aspect ratios and minimum sizes above tiny images", () => {
    const scored = scoreImages([
      { url: "https://example.com/tiny-preview.jpg", kind: "image", source: "openGraph", width: 80, height: 60 },
      { url: "https://example.com/social-card.jpg", kind: "image", source: "html", width: 1200, height: 630 }
    ]);

    expect(scored[0].url).toBe("https://example.com/social-card.jpg");
    expect(scored[0].metadata?.scoreReasons).toEqual(expect.arrayContaining([expect.stringContaining("social preview ratio")]));
  });
});
