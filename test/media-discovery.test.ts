import { describe, expect, it } from "vitest";
import { extractImages } from "../src/index.js";

describe("media discovery", () => {
  it("extracts srcset, lazy attributes, video posters, and noscript fallbacks", () => {
    const html = `
      <html>
        <body>
          <img src="/hero.jpg" srcset="/hero-640.jpg 640w, /hero-1200.jpg 1200w" width="1200" height="630">
          <img data-src="/lazy-src.jpg" data-original="/original.jpg" data-lazy-src="/lazy.jpg">
          <img data-image="/data-image.jpg" data-thumbnail="/thumb.jpg">
          <picture>
            <source srcset="/picture.webp 1x, /picture@2x.webp 2x" type="image/webp">
          </picture>
          <video poster="/video-poster.jpg" width="1280" height="720"></video>
          <noscript><img src="/fallback.jpg" width="1000" height="563"></noscript>
          <img src="data:image/png;base64,abc">
          <img src="/pixel.gif" width="1" height="1">
          <img src="/sprite.png" width="1200" height="630">
          <img src="/favicon.ico" width="32" height="32">
        </body>
      </html>
    `;

    const urls = extractImages(html, "https://example.com/post").map((image) => image.url);

    expect(urls).toEqual(expect.arrayContaining([
      "https://example.com/hero.jpg",
      "https://example.com/hero-640.jpg",
      "https://example.com/hero-1200.jpg",
      "https://example.com/lazy-src.jpg",
      "https://example.com/original.jpg",
      "https://example.com/lazy.jpg",
      "https://example.com/data-image.jpg",
      "https://example.com/thumb.jpg",
      "https://example.com/picture.webp",
      "https://example.com/picture@2x.webp",
      "https://example.com/video-poster.jpg",
      "https://example.com/fallback.jpg"
    ]));
    expect(urls).not.toContain("https://example.com/pixel.gif");
    expect(urls).not.toContain("https://example.com/sprite.png");
    expect(urls).not.toContain("https://example.com/favicon.ico");
  });
});
