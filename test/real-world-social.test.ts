import { describe, expect, it } from "vitest";
import { parseMetadata } from "../src/index.js";

describe("real-world social extraction fallbacks", () => {
  it("extracts Reddit title, author, date, and media from embedded state when OG is weak", () => {
    const metadata = parseMetadata(`
      <title>Reddit fallback</title>
      <script>
        window.__INITIAL_STATE__ = {
          "post": {
            "title": "Embedded Reddit post",
            "description": "A fallback Reddit description.",
            "author": { "name": "u/example" },
            "createdAt": "2026-06-04T09:00:00Z",
            "previewImage": "https://preview.redd.it/cover-preview.jpg",
            "media": { "videoUrl": "https://v.redd.it/example/DASH_720.mp4" }
          }
        };
      </script>
    `, "https://www.reddit.com/r/typescript/comments/abc123/metanova/");

    expect(metadata.type).toBe("social_post");
    expect(metadata.title).toBe("Embedded Reddit post");
    expect(metadata.author?.name).toBe("u/example");
    expect(metadata.article?.publishedTime).toBe("2026-06-04T09:00:00Z");
    expect(metadata.bestImage).toBe("https://preview.redd.it/cover-preview.jpg");
    expect(metadata.videos[0].url).toBe("https://v.redd.it/example/DASH_720.mp4");
  });

  it("extracts Pinterest and Behance embedded media", () => {
    const pinterest = parseMetadata(`
      <script type="application/json" id="pws">
        {"pin":{"pinTitle":"Pinterest embedded pin","description":"Pin description","pinner":{"name":"Designer"},"images":[{"url":"https://i.pinimg.com/originals/pin-cover.jpg","width":1200,"height":1800}]}}
      </script>
    `, "https://www.pinterest.com/pin/123456789/");

    const behance = parseMetadata(`
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"project":{"projectTitle":"Behance embedded project","owners":[{"name":"Studio"}],"coverImage":{"url":"https://mir-s3-cdn-cf.behance.net/project-cover.jpg","width":1400,"height":1000}}}}}
      </script>
    `, "https://www.behance.net/gallery/123456789/metanova");

    expect(pinterest.type).toBe("social_post");
    expect(pinterest.title).toBe("Pinterest embedded pin");
    expect(pinterest.author?.name).toBe("Designer");
    expect(pinterest.bestImage).toBe("https://i.pinimg.com/originals/pin-cover.jpg");
    expect(behance.type).toBe("image");
    expect(behance.title).toBe("Behance embedded project");
    expect(behance.author?.name).toBe("Studio");
    expect(behance.bestImage).toBe("https://mir-s3-cdn-cf.behance.net/project-cover.jpg");
  });
});
