import { createPreviewCard, fetchMetadata } from "metanova";

const url = process.argv[2];

if (!url) {
  console.error("Usage: node examples/social-preview.mjs <social-url>");
  process.exitCode = 1;
} else {
  const metadata = await fetchMetadata(url, {
    timeoutMs: 15000,
    maxBytes: 4_000_000
  });

  console.log(createPreviewCard(metadata));
  console.log({
    sources: metadata.sources,
    adapter: metadata.diagnostics.adapter,
    trace: metadata.diagnostics.trace,
    selectedImageReason: metadata.diagnostics.selectedImageReason
  });
}
