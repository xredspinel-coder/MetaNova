import { describe, expect, it } from "vitest";
import { parseMetadata } from "../src/index.js";

describe("YouTube advanced adapter", () => {
  it("uses deterministic source priority for video titles", () => {
    const html = `
      <title>Generic YouTube Page - YouTube</title>
      <meta property="og:title" content="Open Graph title that should not win">
      <meta name="twitter:title" content="Twitter title that should not win">
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          "name": "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
          "description": "Structured description.",
          "uploadDate": "2009-10-25T06:57:33Z",
          "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
        }
      </script>
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "videoId": "dQw4w9WgXcQ",
            "title": "Player title that should lose to VideoObject",
            "author": "Rick Astley",
            "shortDescription": "Player description."
          }
        };
      </script>
      <script>
        var ytInitialData = {
          "metadata": { "playlistMetadataRenderer": { "title": "Playlist title that should not win" } },
          "contents": [
            { "videoPrimaryInfoRenderer": { "title": { "runs": [{ "text": "Initial data title that should not win" }] } } },
            { "videoRenderer": { "videoId": "related123", "title": { "simpleText": "Related video that should not win" } } }
          ]
        };
      </script>
    `;

    const first = parseMetadata(html, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const second = parseMetadata(html, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(first.title).toBe("Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)");
    expect(second.title).toBe(first.title);
    expect(first.video?.title).toBe(first.title);
    expect(first.publishDate).toBe("2009-10-25T06:57:33Z");
    expect(first.diagnostics.extractionMethod).toBe("youtube:structuredData.VideoObject");
    expect(first.diagnostics.sourcePriority).toEqual(expect.arrayContaining([
      "structuredData:VideoObject",
      "embeddedData:ytInitialPlayerResponse",
      "embeddedData:ytInitialData",
      "openGraph",
      "twitter",
      "html"
    ]));
  });

  it("uses player data before ytInitialData and social fallbacks", () => {
    const metadata = parseMetadata(`
      <title>HTML fallback - YouTube</title>
      <meta property="og:title" content="Open Graph fallback">
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "videoId": "dQw4w9WgXcQ",
            "title": "Stable player title",
            "shortDescription": "Stable player description."
          }
        };
      </script>
      <script>
        var ytInitialData = {
          "contents": [
            { "videoPrimaryInfoRenderer": { "title": { "simpleText": "Initial data fallback" } } },
            { "videoRenderer": { "videoId": "other", "title": { "simpleText": "Unrelated related title" } } }
          ]
        };
      </script>
    `, "https://youtu.be/dQw4w9WgXcQ");

    expect(metadata.title).toBe("Stable player title");
    expect(metadata.description).toBe("Stable player description.");
    expect(metadata.diagnostics.extractionMethod).toBe("youtube:ytInitialPlayerResponse");
  });

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
