import { fetchMetadata } from "metanova";

const url = process.argv[2];

if (!url) {
  console.error("Usage: node examples/youtube-playlist.mjs <youtube-playlist-or-watch-url>");
  process.exitCode = 1;
} else {
  const metadata = await fetchMetadata(url, {
    timeoutMs: 15000,
    maxBytes: 5_000_000
  });

  console.log({
    type: metadata.type,
    playlist: metadata.playlist,
    diagnostics: metadata.diagnostics
  });
}
