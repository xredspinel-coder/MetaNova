import { createPreviewCard, parseMetadata } from "metanova";

const html = `
  <meta property="og:site_name" content="Pinterest">
  <script id="__PWS_DATA__" type="application/json">
    {
      "props": {
        "pin": {
          "pinTitle": "A clean product moodboard",
          "description": "Pinterest-style embedded pin payload.",
          "pinner": { "name": "Design Studio" },
          "createdAt": "2026-06-04T10:00:00Z",
          "images": [{ "url": "https://i.pinimg.com/originals/pin-cover.jpg", "width": 1200, "height": 1800 }]
        }
      }
    }
  </script>
`;

const metadata = parseMetadata(html, "https://www.pinterest.com/pin/123456789/");

console.log(createPreviewCard(metadata));
