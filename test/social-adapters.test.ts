import { describe, expect, it } from "vitest";
import { parseMetadata } from "../src/index.js";

const SOCIAL_HTML = `
  <html>
    <head>
      <meta property="og:title" content="A platform post">
      <meta property="og:description" content="Shared media from a platform.">
      <meta property="og:image" content="/cover.jpg">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
    </head>
  </html>
`;

describe("site adapters", () => {
  it("detects Reddit posts as social posts", () => {
    const metadata = parseMetadata(SOCIAL_HTML, "https://www.reddit.com/r/typescript/comments/abc123/metanova/");

    expect(metadata.type).toBe("social_post");
    expect(metadata.siteName).toBe("Reddit");
    expect(metadata.diagnostics.sourcesUsed).toContain("redditAdapter");
  });

  it("detects Pinterest pins and Behance projects", () => {
    const pinterest = parseMetadata(SOCIAL_HTML, "https://www.pinterest.com/pin/123456789/");
    const behance = parseMetadata(SOCIAL_HTML, "https://www.behance.net/gallery/123456789/project");

    expect(pinterest.type).toBe("social_post");
    expect(pinterest.siteName).toBe("Pinterest");
    expect(behance.type).toBe("image");
    expect(behance.siteName).toBe("Behance");
  });

  it("detects YouTube videos", () => {
    const metadata = parseMetadata(SOCIAL_HTML, "https://youtu.be/dQw4w9WgXcQ");

    expect(metadata.type).toBe("video");
    expect(metadata.siteName).toBe("YouTube");
    expect(metadata.canonicalUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("detects X and Instagram public posts", () => {
    const x = parseMetadata(SOCIAL_HTML, "https://x.com/example/status/1234567890");
    const instagram = parseMetadata(SOCIAL_HTML, "https://www.instagram.com/p/ABC123/");

    expect(x.type).toBe("social_post");
    expect(x.siteName).toBe("X");
    expect(instagram.type).toBe("social_post");
    expect(instagram.siteName).toBe("Instagram");
  });
});
