import { createPreviewCard, fetchMetadata } from "metanova";

const url = process.argv[2];

if (!url) {
  console.error("Usage: node examples/live-fetch.mjs <url>");
  process.exitCode = 1;
} else {
  const metadata = await fetchMetadata(url, {
    timeoutMs: 15000,
    maxBytes: 4_000_000
  });

  console.log(createPreviewCard(metadata));
  console.log({
    confidence: metadata.confidence,
    completeness: metadata.completeness,
    reliability: metadata.reliability,
    diagnostics: metadata.diagnostics
  });
}
