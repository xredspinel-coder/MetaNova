# MetaNova

[![npm version](https://img.shields.io/npm/v/metanova.svg)](https://www.npmjs.com/package/metanova)
[![License](https://img.shields.io/npm/l/metanova.svg)](https://www.npmjs.com/package/metanova)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

MetaNova is a modular JavaScript and TypeScript library for extracting, analyzing, scoring, and normalizing metadata from web pages and public URLs.

It is designed for link previews, bots, bookmark managers, search systems, AI agents, browser extensions, dashboards, CMS integrations, and content aggregation platforms.

## Features

- Open Graph, Twitter Cards, JSON-LD, Schema.org, oEmbed discovery, standard HTML metadata, canonical URLs, favicons, images, videos, and audio.
- Unified typed JSON output with diagnostics.
- Embedded data extraction from `__NEXT_DATA__`, Nuxt payloads, window state objects, Apollo-like caches, and JSON script blobs.
- MediaDiscoveryEngine for deterministic image/video/audio candidate unification.
- Smart image scoring for deterministic `bestImage` selection with human-readable diagnostics.
- ConfidenceEngine and completeness scoring from 0 to 100.
- Redirect-aware fetch pipeline with timeouts, retries, byte limits, and SSRF protections.
- Browser-like request headers by default, with user override options.
- Site adapter layer for Reddit, Pinterest, Behance, YouTube, TikTok, X/Twitter, Facebook, and Instagram.
- Plugin API for custom extractors, adapters, and scorers.
- ESM and CommonJS builds with TypeScript declarations.

## Install

```bash
npm install metanova
```

## Usage

```ts
import { createPreviewCard, fetchMetadata } from "metanova";

const metadata = await fetchMetadata("https://example.com/article");
const card = createPreviewCard(metadata);

console.log(metadata.bestImage);
console.log(card);
```

For already-downloaded HTML:

```ts
import { parseMetadata } from "metanova";

const metadata = parseMetadata(html, "https://example.com/article");
```

## Unified Output

```ts
{
  ok: true,
  url: "https://example.com/article",
  finalUrl: "https://example.com/article",
  type: "article",
  title: "...",
  description: "...",
  siteName: "...",
  canonicalUrl: "...",
  confidence: 94,
  completeness: 88,
  bestImage: "...",
  images: [],
  videos: [],
  audio: [],
  favicons: [],
  article: {},
  product: {},
  diagnostics: {
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    redirects: [],
    sourcesUsed: ["openGraph", "jsonLd", "html"],
    warnings: [],
    trace: ["downloaded page", "parsed Open Graph", "selected image from openGraph"],
    selectedImageReason: "Selected openGraph image with 1200x630, score 100.",
    extractedAt: "..."
  }
}
```

## Public API

```ts
fetchMetadata(url, options)
parseMetadata(html, url, options)
parseMetadataAsync(html, url, options)
normalizeMetadata(rawSources)
extractOpenGraph(html)
extractTwitterCards(html)
extractJsonLd(html)
extractOEmbed(html, url)
extractEmbeddedData(html)
extractImages(html, baseUrl)
extractVideos(html, baseUrl)
extractAudio(html, baseUrl)
resolveUrl(url, baseUrl)
scoreImages(images)
discoverMedia(rawSources, finalUrl)
calculateConfidence(input)
calculateCompleteness(input)
createPreviewCard(metadata)
MetaNova.use(plugin)
```

## Architecture

MetaNova is a layered extraction pipeline:

1. URL validation, short-link detection, redirect resolution, and secure fetch.
2. Browser-like download with realistic `User-Agent`, `Accept`, `Accept-Language`, and `Accept-Encoding` headers.
3. Source extractors for Open Graph, Twitter Cards, JSON-LD, embedded application data, oEmbed, HTML metadata, and media tags.
4. Site adapters for social and content platforms.
5. `MediaDiscoveryEngine` unifies media candidates from every source.
6. Image scoring ranks candidates and explains `bestImage`.
7. `ConfidenceEngine` and completeness scoring measure result quality from 0 to 100.
8. Normalization returns a stable JSON shape plus diagnostics and extraction trace.

## Adapters

Built-in adapters recover title, description, images, videos, author, publish date, and identifiers for Reddit, Pinterest, Behance, YouTube, TikTok, X/Twitter, Facebook, and Instagram. They use embedded app data and discovered media as fallbacks when Open Graph is weak.

## Confidence Engine

`confidence` is an integer from 0 to 100. It considers title quality, description quality, image quality, canonical URL, structured data, adapter success, embedded data, and warnings.

`completeness` is also 0 to 100. It measures how many useful preview fields are present.

`reliability` is 0 to 100 and combines confidence, completeness, adapter success, media quality, and warnings.

## Media Discovery Engine

The engine searches Open Graph, Twitter Cards, JSON-LD, embedded app data, oEmbed, HTML images, `srcset`, `picture`, lazy-loaded attributes, video posters, social platform media, and fallback images. It resolves relative URLs, filters weak candidates, and deduplicates near-identical media.

## Diagnostics And Extraction Trace

Diagnostics include `sourcesUsed`, `warnings`, `redirects`, `selectedImageReason`, and `trace`.

Important fields also include source attribution:

```json
{
  "sources": {
    "title": "jsonLd",
    "description": "openGraph",
    "author": "youtubeAdapter",
    "image": "twitter"
  },
  "diagnostics": {
    "adapter": {
      "matched": true,
      "name": "youtubeAdapter",
      "confidence": 95
    }
  }
}
```

```json
[
  "downloaded page",
  "parsed Open Graph",
  "parsed JSON-LD",
  "adapter matched: redditAdapter",
  "selected image from redditAdapter (openGraph)"
]
```

## Performance

MetaNova stays lightweight by default: no browser automation in core, bounded response size, request timeouts, retry controls, cache hooks, and mostly synchronous parsing for already-downloaded HTML.

## Security Defaults

`fetchMetadata` blocks risky targets by default:

- `localhost`
- loopback IPs
- private network IPs
- link-local and reserved networks
- unsupported protocols
- oversized responses
- malicious redirect targets

You can opt into trusted internal targets:

```ts
await fetchMetadata("http://localhost:3000", {
  allowLocalhost: true,
  allowPrivateNetwork: true
});
```

## Plugins

```ts
import { MetaNova, type MetaNovaPlugin } from "metanova";

const plugin: MetaNovaPlugin = {
  name: "custom-docs",
  setup(api) {
    api.addExtractor("docs", ({ $ }) => ({
      source: "docs",
      title: $("meta[name='doc:title']").attr("content"),
      siteName: "Docs"
    }));

    api.addImageScorer((image) => (image.url.includes("/hero/") ? 10 : 0));
  }
};

MetaNova.use(plugin);
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

Mock examples use local HTML fixtures and do not require network:

```bash
node examples/reddit.mjs
node examples/pinterest.mjs
node examples/behance.mjs
node examples/youtube.mjs
node examples/diagnostics.mjs
```

Live network examples take URLs from arguments and intentionally do not embed validation URLs:

```bash
node examples/live-fetch.mjs https://example.com
node examples/youtube-video.mjs https://example.com
node examples/youtube-playlist.mjs https://example.com
node examples/social-preview.mjs https://example.com
```

For a full from-zero walkthrough, see [USAGE_GUIDE.md](./USAGE_GUIDE.md).

## Project Layout

```txt
src/
  adapters/
  diagnostics/
  extractors/
  fetcher/
  normalizers/
  plugins/
  scorers/
  types/
  utils/
  index.ts
```

## Publishing

The package is configured with dual ESM/CommonJS exports, generated type declarations, source maps, an npm `files` allowlist, and Node engine constraints. Run `npm run build` before publishing.
