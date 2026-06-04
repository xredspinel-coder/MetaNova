import { parseMetadata } from "metanova";

const metadata = parseMetadata(`
  <meta property="og:title" content="Diagnostics example">
  <meta property="og:description" content="Inspect trace, confidence, completeness, and image scoring.">
  <meta property="og:image" content="/social-preview.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
`, "https://example.com/post");

console.log({
  confidence: metadata.confidence,
  completeness: metadata.completeness,
  bestImage: metadata.bestImage,
  selectedImageReason: metadata.diagnostics.selectedImageReason,
  trace: metadata.diagnostics.trace
});
