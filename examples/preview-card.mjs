import { createPreviewCard, parseMetadata } from "metanova";

const metadata = parseMetadata(`
  <meta property="og:title" content="Preview Card">
  <meta property="og:description" content="Small JSON for bots and apps.">
  <meta property="og:image" content="/preview-card.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
`, "https://example.com/preview-card");

console.log(createPreviewCard(metadata));
