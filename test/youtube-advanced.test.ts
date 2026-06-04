import { describe, expect, it } from "vitest";
import { parseMetadata } from "../src/index.js";

describe("YouTube advanced adapter", () => {
  it("detects playlist metadata and returns fetchable video URLs", () => {
    const metadata = parseMetadata(`
      <script>
        var ytInitialData = {
          "metadata": { "playlistMetadataRenderer": { "title": "Fixture playlist" } },
          "contents": [
            { "playlistVideoRenderer": { "videoId": "abc123", "title": { "runs": [{ "text": "First video" }] } } },
            { "playlistVideoRenderer": { "videoId": "def456", "title": { "simpleText": "Second video" } } }
          ],
          "ownerChannelName": "Fixture Channel"
        };
      </script>
    `, "https://www.youtube.com/watch?v=abc123&list=PL_fixture");

    expect(metadata.type).toBe("playlist");
    expect(metadata.playlist?.id).toBe("PL_fixture");
    expect(metadata.playlist?.videos).toEqual(expect.arrayContaining([
      { id: "abc123", title: "First video", url: "https://www.youtube.com/watch?v=abc123" },
      { id: "def456", title: "Second video", url: "https://www.youtube.com/watch?v=def456" }
    ]));
    expect(metadata.diagnostics.adapter).toMatchObject({ matched: true, name: "youtubeAdapter" });
  });

  it("detects community posts as social posts with embedded content", () => {
    const metadata = parseMetadata(`
      <script>
        var ytInitialData = {
          "contentText": { "runs": [{ "text": "Community update text" }] },
          "author": { "name": "Fixture Channel" },
          "publishedTimeText": { "simpleText": "1 day ago" },
          "image": { "url": "/community.jpg", "width": 1200, "height": 630 }
        };
      </script>
    `, "https://www.youtube.com/post/fixturePostId");

    expect(metadata.type).toBe("social_post");
    expect(metadata.title).toBe("Community update text");
    expect(metadata.author?.name).toBe("Fixture Channel");
    expect(metadata.bestImage).toBe("https://www.youtube.com/community.jpg");
  });
});
