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

  it("uses TikTok video detail payload instead of generic Shop templates", () => {
    const metadata = parseMetadata(`
      <html>
        <head>
          <title>TikTok - Make Your Day</title>
        </head>
        <body>
          <script type="application/json">
            {"title":"Check out {s_keywords} selection on TikTok Shop and get free shipping on eligible items. Discover trending items and exclusive collections!"}
          </script>
          <script type="application/json" id="__UNIVERSAL_DATA_FOR_REHYDRATION__">
            {
              "__DEFAULT_SCOPE__": {
                "webapp.video-detail": {
                  "itemInfo": {
                    "itemStruct": {
                      "id": "7000000000000000001",
                      "desc": "Take You to Hell - Ava Max #music #takeyoutohell #avamax #lyrics #fyp ",
                      "createTime": "1777085736",
                      "author": {
                        "uniqueId": "example.user",
                        "nickname": "Zizi Ziza"
                      },
                      "stats": {
                        "playCount": "12345"
                      },
                      "music": {
                        "title": "Take You To Hell",
                        "authorName": "Ava Max"
                      },
                      "video": {
                        "id": "7000000000000000001",
                        "width": 1024,
                        "height": 576,
                        "duration": 164,
                        "originCover": "https://p16-common-sign.tiktokcdn.com/video-cover.image",
                        "playAddr": "https://v16-webapp-prime.tiktok.com/video.mp4",
                        "PlayAddrStruct": {
                          "UrlList": ["https://v19-webapp-prime.tiktok.com/video.mp4"]
                        }
                      }
                    }
                  }
                }
              }
            }
          </script>
        </body>
      </html>
    `, "https://www.tiktok.com/@example.user/video/7000000000000000001");

    expect(metadata.type).toBe("social_post");
    expect(metadata.title).toBe("Take You to Hell - Ava Max #music #takeyoutohell #avamax #lyrics #fyp");
    expect(metadata.description).toBe("Take You to Hell - Ava Max #music #takeyoutohell #avamax #lyrics #fyp");
    expect(metadata.title).not.toContain("{s_keywords}");
    expect(metadata.bestImage).toBe("https://p16-common-sign.tiktokcdn.com/video-cover.image");
    expect(metadata.videos.map((video) => video.url)).toEqual(expect.arrayContaining([
      "https://v16-webapp-prime.tiktok.com/video.mp4",
      "https://v19-webapp-prime.tiktok.com/video.mp4"
    ]));
    expect(metadata.author?.name).toBe("Zizi Ziza");
    expect(metadata.video).toMatchObject({
      id: "7000000000000000001",
      duration: "164",
      viewCount: 12345
    });
  });

  it("does not use generic TikTok navigation titles for photo fallbacks", () => {
    const metadata = parseMetadata(`
      <script type="application/json">
        {
          "__DEFAULT_SCOPE__": {
            "webapp.biz-context": {
              "navList": [
                { "title": "TikTok LIVE Creator Networks" }
              ]
            }
          }
        }
      </script>
    `, "https://www.tiktok.com/@examplephoto/photo/7000000000000000002");

    expect(metadata.title).toBe("TikTok post by @examplephoto");
    expect(metadata.title).not.toBe("TikTok LIVE Creator Networks");
    expect(metadata.diagnostics.extractionMethod).toBe("tiktok:urlFallback");
  });
});
