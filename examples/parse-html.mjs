import { parseMetadata } from "metanova";

const html = `
  <html>
    <head>
      <title>Parsed HTML</title>
      <meta name="description" content="Parse already-downloaded HTML.">
      <img src="/inline.jpg" width="800" height="450">
    </head>
  </html>
`;

const metadata = parseMetadata(html, "https://example.com/articles/parsed-html");

console.log(metadata);
