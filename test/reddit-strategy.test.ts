import { describe, expect, it } from "vitest";
import { fetchMetadata } from "../src/index.js";

describe("Reddit extraction strategy", () => {
  it("uses the official JSON endpoint before HTML fallbacks", async () => {
    const seenUrls: string[] = [];
    const createdUtc = Date.parse("2026-06-04T09:00:00.000Z") / 1000;

    const metadata = await fetchMetadata("https://www.reddit.com/r/typescript/comments/abc123/metanova/", {
      fetch: async (input) => {
        const url = String(input);
        seenUrls.push(url);

        return new Response(JSON.stringify([
          {
            data: {
              children: [
                {
                  kind: "t3",
                  data: {
                    id: "abc123",
                    title: "JSON Reddit Post",
                    author: "u_json",
                    created_utc: createdUtc,
                    permalink: "/r/typescript/comments/abc123/metanova/",
                    selftext: "A Reddit post extracted from the JSON endpoint.",
                    preview: {
                      images: [
                        {
                          source: {
                            url: "https://preview.redd.it/json-cover.jpg?width=1200&amp;height=630",
                            width: 1200,
                            height: 630
                          }
                        }
                      ]
                    },
                    secure_media: {
                      reddit_video: {
                        fallback_url: "https://v.redd.it/abc123/DASH_720.mp4",
                        width: 1280,
                        height: 720
                      }
                    }
                  }
                }
              ]
            }
          }
        ]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    });

    expect(seenUrls).toHaveLength(1);
    expect(seenUrls[0]).toContain(".json");
    expect(metadata.title).toBe("JSON Reddit Post");
    expect(metadata.description).toBe("A Reddit post extracted from the JSON endpoint.");
    expect(metadata.author?.name).toBe("u_json");
    expect(metadata.publishDate).toBe("2026-06-04T09:00:00.000Z");
    expect(metadata.bestImage).toBe("https://preview.redd.it/json-cover.jpg?width=1200&height=630");
    expect(metadata.videos[0].url).toBe("https://v.redd.it/abc123/DASH_720.mp4");
    expect(metadata.diagnostics.extractionMethod).toBe("reddit:jsonEndpoint");
    expect(metadata.diagnostics.fallbacksAttempted).toEqual([
      expect.objectContaining({ method: "redditJsonEndpoint", ok: true, statusCode: 200 })
    ]);
  });

  it("reports blocked Reddit attempts and retry information", async () => {
    const metadata = await fetchMetadata("https://www.reddit.com/r/typescript/comments/blocked/metanova/", {
      fetch: async (input) => {
        const url = String(input);
        if (url.includes(".json")) {
          return new Response("Too Many Requests", {
            status: 429,
            headers: {
              "content-type": "text/plain",
              "retry-after": "30"
            }
          });
        }

        if (url.includes("old.reddit.com")) {
          return new Response("<html><title>whoa there, pardner</title><body>blocked</body></html>", {
            status: 403,
            headers: { "content-type": "text/html" }
          });
        }

        return new Response("<html><title>blocked</title><body>please wait for verification</body></html>", {
          status: 403,
          headers: { "content-type": "text/html" }
        });
      }
    });

    expect(metadata.ok).toBe(false);
    expect(metadata.diagnostics.fallbacksAttempted).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "redditJsonEndpoint", statusCode: 429, blocked: true, retryAfter: "30" }),
      expect.objectContaining({ method: "oldReddit", statusCode: 403, blocked: true }),
      expect.objectContaining({ method: "redditHtmlFallback", statusCode: 403, blocked: true })
    ]));
    expect(metadata.diagnostics.retryInfo).toMatchObject({
      retryable: true,
      retryAfter: "30",
      retryAfterMs: 30000
    });
    expect(metadata.diagnostics.warnings.join(" ")).toContain("blocked");
  });
});
