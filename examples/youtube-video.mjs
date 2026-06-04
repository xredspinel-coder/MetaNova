import { fetchMetadata } from "metanova";

const url = process.argv[2];

if (!url) {
  console.error("Usage: node examples/youtube-video.mjs <youtube-video-url>");
  process.exitCode = 1;
} else {
  const metadata = await fetchMetadata(url, {
    timeoutMs: 15000,
    maxBytes: 5_000_000
  });

  console.log({
    title: metadata.title,
    channel: metadata.video?.channel ?? metadata.author,
    video: metadata.video,
    bestImage: metadata.bestImage,
    confidence: metadata.confidence,
    diagnostics: metadata.diagnostics
  });
}
