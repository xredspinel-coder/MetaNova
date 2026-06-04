import { createPreviewCard, fetchMetadata } from "metanova";

const html = `
  <html>
    <head>
      <meta property="og:title" content="MetaNova Quick Start">
      <meta property="og:description" content="A fast metadata extraction example.">
      <meta property="og:image" content="http://127.0.0.1/cover.jpg">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <link rel="canonical" href="http://127.0.0.1/posts/quick-start">
    </head>
  </html>
`;

const metadata = await fetchMetadata("http://127.0.0.1/posts/quick-start", {
  allowLocalhost: true,
  fetch: async () => new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  })
});

console.log(createPreviewCard(metadata));
