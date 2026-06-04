import { createPreviewCard, parseMetadata } from "metanova";

const html = `
  <meta property="og:site_name" content="YouTube">
  <script>
    window.__INITIAL_STATE__ = {
      "videoDetails": {
        "title": "Building MetaNova",
        "description": "A YouTube-style payload without relying only on OG tags.",
        "ownerChannelName": "MetaNova Labs",
        "uploadDate": "2026-06-04T12:00:00Z",
        "contentUrl": "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "thumbnail": { "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg", "width": 1280, "height": 720 }
      }
    };
  </script>
`;

const metadata = parseMetadata(html, "https://youtu.be/dQw4w9WgXcQ");

console.log(createPreviewCard(metadata));
console.log(metadata.videos);
