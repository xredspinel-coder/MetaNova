import { createPreviewCard, parseMetadata } from "metanova";

const html = `
  <script id="__NEXT_DATA__" type="application/json">
    {
      "props": {
        "pageProps": {
          "project": {
            "projectTitle": "Identity system for MetaNova",
            "description": "A Behance-style project page powered by Next.js data.",
            "owners": [{ "name": "Creative Lab" }],
            "publishedTime": "2026-06-04T11:00:00Z",
            "coverImage": { "url": "https://mir-s3-cdn-cf.behance.net/project-cover.jpg", "width": 1400, "height": 1000 }
          }
        }
      }
    }
  </script>
`;

const metadata = parseMetadata(html, "https://www.behance.net/gallery/123456789/metanova");

console.log(createPreviewCard(metadata));
