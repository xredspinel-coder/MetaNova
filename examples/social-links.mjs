import { parseMetadata } from "metanova";

const html = `
  <meta property="og:title" content="Platform post">
  <meta property="og:description" content="A public social or media page.">
  <meta property="og:image" content="/cover.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
`;

const urls = [
  "https://www.reddit.com/r/typescript/comments/abc123/metanova/",
  "https://www.pinterest.com/pin/123456789/",
  "https://www.behance.net/gallery/123456789/project",
  "https://youtu.be/dQw4w9WgXcQ",
  "https://x.com/example/status/1234567890",
  "https://www.instagram.com/p/ABC123/"
];

for (const url of urls) {
  const metadata = parseMetadata(html, url);
  console.log({
    url,
    type: metadata.type,
    siteName: metadata.siteName,
    bestImage: metadata.bestImage
  });
}
