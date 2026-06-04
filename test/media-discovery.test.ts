import { describe, expect, it } from "vitest";
import { extractImages, parseMetadata } from "../src/index.js";

describe("media discovery", () => {
  it("extracts srcset, lazy attributes, video posters, and noscript fallbacks", () => {
    const html = `
      <html>
        <body>
          <link rel="preload" as="image" href="/preload.jpg" imagesrcset="/preload-800.jpg 800w, /preload-1600.jpg 1600w">
          <img src="/hero.jpg" srcset="/hero-640.jpg 640w, /hero-1200.jpg 1200w" width="1200" height="630">
          <img data-src="/lazy-src.jpg" data-original="/original.jpg" data-lazy-src="/lazy.jpg" data-srcset="/lazy-800.jpg 800w, /lazy-1600.jpg 1600w">
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
      "https://example.com/preload.jpg",
      "https://example.com/preload-800.jpg",
      "https://example.com/preload-1600.jpg",
      "https://example.com/hero-640.jpg",
      "https://example.com/hero-1200.jpg",
      "https://example.com/lazy-src.jpg",
      "https://example.com/original.jpg",
      "https://example.com/lazy.jpg",
      "https://example.com/lazy-800.jpg",
      "https://example.com/lazy-1600.jpg",
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

  it("discovers social media blobs from embedded JSON payloads", () => {
    const metadata = parseMetadata(`
      <script type="application/json">
        {
          "post": {
            "title": "Social payload",
            "media_url_https": "https://pbs.twimg.com/media/example?format=jpg&name=large",
            "preview": {
              "images": [
                {
                  "source": {
                    "url": "https://preview.redd.it/source-image.jpg",
                    "width": 1600,
                    "height": 900
                  }
                }
              ]
            },
            "video": {
              "fallback_url": "https://v.redd.it/example/DASH_720.mp4",
              "width": 1280,
              "height": 720
            }
          }
        }
      </script>
      <meta property="og:image" content="https://example.com/logo.png">
      <meta property="og:image:width" content="80">
      <meta property="og:image:height" content="80">
    `, "https://x.com/example/status/1");

    expect(metadata.images.map((image) => image.url)).toEqual(expect.arrayContaining([
      "https://pbs.twimg.com/media/example?format=jpg&name=large",
      "https://preview.redd.it/source-image.jpg"
    ]));
    expect(metadata.videos.map((video) => video.url)).toContain("https://v.redd.it/example/DASH_720.mp4");
    expect(metadata.bestImage).toBe("https://preview.redd.it/source-image.jpg");
  });
});
