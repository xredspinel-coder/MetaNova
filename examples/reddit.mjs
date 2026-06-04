import { createPreviewCard, parseMetadata } from "metanova";

const html = `
  <title>Fallback Reddit title</title>
  <meta property="og:site_name" content="Reddit">
  <script>
    window.__INITIAL_STATE__ = {
      "post": {
        "title": "MetaNova real world extraction",
        "description": "A Reddit-style post with useful embedded data.",
        "author": { "name": "u/metanova" },
        "createdAt": "2026-06-04T09:00:00Z",
        "previewImage": "https://preview.redd.it/metanova-card.jpg",
        "media": { "videoUrl": "https://v.redd.it/metanova/DASH_720.mp4" }
      }
    };
  </script>
`;

const metadata = parseMetadata(html, "https://www.reddit.com/r/typescript/comments/abc123/metanova/");

console.log(createPreviewCard(metadata));
console.log(metadata.diagnostics.trace);
