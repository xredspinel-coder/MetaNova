# MetaNova Usage Guide

This guide explains how to use MetaNova from zero: installation, quick starts, API details, security options, diagnostics, adapters, plugins, examples, validation, and troubleshooting.

## Introduction

MetaNova is a JavaScript and TypeScript metadata extraction library. It turns web pages and public URLs into a predictable JSON object for link previews, bots, bookmark managers, AI agents, search systems, dashboards, CMS integrations, and social tooling.

MetaNova can extract from:

- Open Graph tags
- Twitter Cards
- JSON-LD and Schema.org
- oEmbed discovery and optional oEmbed JSON
- Standard HTML metadata
- Canonical URLs
- Favicons
- Images, lazy images, `srcset`, `picture`, video posters, and `noscript` fallback images
- Videos and audio
- Built-in site adapters for common social/media platforms
- Custom plugins and adapters

## Installation

```bash
npm install metanova
```

For local development in this repository:

```bash
npm install
npm run build
```

## Quick Start

```ts
import { fetchMetadata, createPreviewCard } from "metanova";

const metadata = await fetchMetadata("https://example.com/article");
const card = createPreviewCard(metadata);

console.log(metadata.bestImage);
console.log(card);
```

Expected shape:

```json
{
  "title": "Example article",
  "description": "A short summary.",
  "image": "https://example.com/cover.jpg",
  "url": "https://example.com/article",
  "siteName": "Example",
  "type": "article",
  "confidence": 92
}
```

## ESM Usage

```js
import { fetchMetadata, parseMetadata, createPreviewCard } from "metanova";

const metadata = await fetchMetadata("https://example.com/post");
console.log(createPreviewCard(metadata));
```

## CommonJS Usage

```js
const { parseMetadata } = require("metanova");

const metadata = parseMetadata("<title>Hello</title>", "https://example.com");
console.log(metadata.title);
```

## TypeScript Usage

```ts
import {
  fetchMetadata,
  type FetchMetadataOptions,
  type UnifiedMetadata
} from "metanova";

const options: FetchMetadataOptions = {
  timeoutMs: 8000,
  maxBytes: 2_000_000
};

const metadata: UnifiedMetadata = await fetchMetadata("https://example.com", options);
console.log(metadata.confidence);
```

## fetchMetadata

`fetchMetadata(url, options)` downloads a page, follows redirects safely, extracts metadata, normalizes it, scores images, calculates confidence, and returns a unified result.

```ts
const metadata = await fetchMetadata("https://example.com/article", {
  timeoutMs: 8000,
  retries: 1,
  retryDelayMs: 250,
  maxRedirects: 5,
  maxBytes: 2_000_000,
  userAgent: "MyBot/1.0",
  acceptLanguage: "en-US,en;q=0.9",
  fetchOEmbed: true
});
```

Common options:

- `timeoutMs`: request timeout in milliseconds.
- `retries`: retry count after failed requests.
- `retryDelayMs`: delay between retries.
- `maxRedirects`: redirect limit.
- `maxBytes`: maximum response size.
- `userAgent`: custom user agent.
- `accept`: custom Accept header.
- `acceptLanguage`: custom Accept-Language header.
- `acceptEncoding`: custom Accept-Encoding header.
- `headers`: custom headers.
- `fetch`: custom fetch implementation.
- `cache`: optional cache with `get(url)` and `set(url, entry)`.
- `fetchOEmbed`: fetch discovered JSON oEmbed endpoints.
- `allowLocalhost`: allow localhost and loopback URLs.
- `allowPrivateNetwork`: allow private/reserved network targets.

## parseMetadata

`parseMetadata(html, url, options)` extracts metadata from HTML you already have. It does not perform network requests.

```ts
import { parseMetadata } from "metanova";

const metadata = parseMetadata(html, "https://example.com/article");
console.log(metadata.title);
```

Use `parseMetadataAsync` when adapters or plugins may perform asynchronous work, or when you want to fetch oEmbed JSON:

```ts
import { parseMetadataAsync } from "metanova";

const metadata = await parseMetadataAsync(html, "https://example.com/video", {
  fetchOEmbed: true
});
```

## createPreviewCard

`createPreviewCard(metadata)` returns a compact object suitable for bots and application previews.

```ts
import { createPreviewCard } from "metanova";

const card = createPreviewCard(metadata);
```

Output:

```json
{
  "title": "...",
  "description": "...",
  "image": "...",
  "url": "...",
  "siteName": "...",
  "domain": "example.com",
  "author": "...",
  "type": "article",
  "confidence": 92
}
```

## Architecture

MetaNova runs a layered pipeline:

1. URL validation, normalization, short-link detection, redirect handling, and SSRF checks.
2. Browser-like networking with realistic default request headers.
3. Extraction from Open Graph, Twitter Cards, JSON-LD, embedded app data, oEmbed, standard HTML, and media tags.
4. Site adapters for platform-specific recovery.
5. `MediaDiscoveryEngine` to merge images, videos, audio, embedded thumbnails, social media, and fallback assets.
6. Image scoring and `bestImage` selection.
7. `ConfidenceEngine` and completeness scoring.
8. Diagnostics and extraction trace generation.

## Embedded Data Extraction

Modern apps often store preview data outside OG tags. MetaNova extracts:

- `script#__NEXT_DATA__`
- Nuxt payloads
- `window.__INITIAL_STATE__`
- `window.__PRELOADED_STATE__`
- Apollo-style state payloads
- `script[type="application/json"]`
- JSON blobs inside script tags

These sources can provide title, description, author, publish date, images, video thumbnails, and canonical-like URLs.

```ts
import { extractEmbeddedData } from "metanova";

const embedded = extractEmbeddedData(html);
console.log(embedded.items.map((item) => item.source));
```

## Media Discovery Engine

Use `discoverMedia(rawSources, finalUrl)` when you are building custom pipelines from raw extraction sources.

The engine searches:

- Open Graph images/videos/audio
- Twitter images/videos
- JSON-LD images/videos/audio
- embedded application data
- oEmbed thumbnails/photos
- `srcset`, `picture`, lazy image attributes
- video posters
- adapter/plugin media

It filters data URLs, pixels, sprites, placeholders, icons, avatars, and weak duplicates.

## Confidence Engine

`confidence` is an integer from 0 to 100.

It considers title quality, description quality, image quality, canonical URL, structured data, adapter success, embedded data, and warning count.

```ts
console.log(metadata.confidence); // 94
```

## Completeness

`completeness` is an integer from 0 to 100. It measures whether useful preview fields exist:

- title
- description
- best image
- canonical URL
- site name
- author
- publisher
- known type
- publish date
- extra media

```ts
console.log(metadata.completeness); // 88
```

## Reliability

`reliability` is an integer from 0 to 100. It combines confidence, completeness, adapter success, media quality, and warning count.

```ts
console.log(metadata.reliability); // 91
```

## Source Attribution

MetaNova records where important fields came from:

```ts
console.log(metadata.sources);
```

Example:

```json
{
  "title": "jsonLd",
  "description": "openGraph",
  "author": "youtubeAdapter",
  "image": "twitter"
}
```

## Adapter Diagnostics

When an adapter matches, diagnostics include the adapter name and a rough adapter confidence:

```json
{
  "adapter": {
    "matched": true,
    "name": "youtubeAdapter",
    "confidence": 95
  }
}
```

## Working With Images

MetaNova discovers images from:

- `og:image`
- Twitter Card images
- JSON-LD image fields
- oEmbed thumbnails and photos
- `link[rel=image_src]`
- `img[src]`
- `img[srcset]`
- `picture > source[srcset]`
- `data-src`
- `data-original`
- `data-lazy-src`
- `data-image`
- `data-thumbnail`
- video `poster`
- `noscript` fallback images

All relative URLs are resolved against the page URL.

MetaNova ignores common bad candidates:

- base64 and `data:` images
- tracking pixels
- tiny icon images
- sprites
- transparent placeholders
- empty or unsupported URLs

`bestImage` is selected with image scoring. The score considers source reliability, dimensions, aspect ratio, format, URL hints such as `cover` or `preview`, and penalties for `logo`, `avatar`, `sprite`, `pixel`, and `placeholder`.

```ts
console.log(metadata.bestImage);
console.log(metadata.images[0].score);
console.log(metadata.diagnostics.selectedImageReason);
```

Expected reason example:

```txt
Selected because it came from og:image, has 1200x630, and scored 100.
```

## Working With Videos

MetaNova discovers videos from:

- `og:video`
- Twitter player metadata
- JSON-LD `VideoObject`
- oEmbed video data
- HTML `<video>` and `<source>`
- common iframe embeds such as YouTube, Vimeo, TikTok, Instagram, and Facebook

Video posters are also added as image candidates because they are often the best preview image.

```ts
for (const video of metadata.videos) {
  console.log(video.url, video.poster);
}
```

## Working With Diagnostics

Diagnostics explain how the result was produced.

```ts
console.log(metadata.diagnostics);
```

Important fields:

- `originalUrl`: input URL.
- `finalUrl`: final URL after redirects.
- `canonicalUrl`: canonical URL extracted from page metadata.
- `redirects`: redirect chain.
- `isShortUrl`: whether the original URL is a known short-link host.
- `shortUrlProvider`: short-link provider, such as Bitly, Reddit, Pinterest, X, TinyURL, or YouTube.
- `sourcesUsed`: sources that contributed metadata.
- `warnings`: non-fatal extraction issues.
- `errors`: fatal fetch errors when `ok` is false.
- `selectedImageReason`: why `bestImage` was selected.
- `trace`: ordered extraction steps.

Example:

```json
{
  "originalUrl": "https://youtu.be/abc",
  "finalUrl": "https://www.youtube.com/watch?v=abc",
  "canonicalUrl": "https://www.youtube.com/watch?v=abc",
  "redirects": [],
  "isShortUrl": true,
  "shortUrlProvider": "YouTube",
  "sourcesUsed": ["openGraph", "youtubeAdapter"],
  "warnings": [],
  "trace": ["downloaded page", "parsed Open Graph", "adapter matched: youtubeAdapter", "selected image from youtubeAdapter (openGraph)"],
  "selectedImageReason": "Selected because it came from og:image..."
}
```

## Extraction Trace

`diagnostics.trace` is an ordered list of decisions and milestones. It is useful when a preview is weak because it shows whether the page was downloaded, which extractors produced data, which adapter matched, and where the final image came from.

```ts
for (const step of metadata.diagnostics.trace) {
  console.log(step);
}
```

Typical steps include:

- `downloaded page`
- `parsed Open Graph`
- `parsed JSON-LD`
- `parsed embedded application data`
- `adapter matched: redditAdapter`
- `selected image from redditAdapter (openGraph)`

## Security Options

MetaNova protects `fetchMetadata` against SSRF-style targets by default.

Blocked by default:

- `localhost`
- loopback addresses
- private network addresses
- link-local and reserved networks
- unsupported protocols
- malicious redirects to blocked targets
- oversized responses

Trusted local development example:

```ts
await fetchMetadata("http://127.0.0.1:3000", {
  allowLocalhost: true,
  allowPrivateNetwork: true
});
```

## Performance

MetaNova core does not run browser automation. It relies on browser-like networking, static HTML parsing, embedded JSON payload extraction, bounded response sizes, and adapter-specific heuristics. This keeps the default package fast and suitable for bots, serverless functions, queues, and indexing jobs.

Performance controls:

- `timeoutMs`
- `retries`
- `retryDelayMs`
- `maxRedirects`
- `maxBytes`
- `cache`
- `fetchOEmbed`

Size and timeout controls:

```ts
await fetchMetadata("https://example.com", {
  timeoutMs: 5000,
  maxBytes: 1_000_000,
  maxRedirects: 3,
  acceptLanguage: "en-US,en;q=0.9"
});
```

## Adapters

Adapters add site-specific behavior. Built-in adapters currently cover:

- Reddit posts and `redd.it`
- Pinterest pins and `pin.it`
- Behance projects
- YouTube videos and `youtu.be`
- TikTok posts
- X/Twitter posts and `t.co`
- Facebook public posts
- Instagram public posts
- YouTube playlists and community posts

Adapter contract:

```ts
const adapter = {
  name: "docsAdapter",
  detect(url) {
    return url.hostname === "docs.example.com";
  },
  extract(context) {
    return {
      source: "docsAdapter",
      title: context.raw.openGraph.title,
      platform: "Docs"
    };
  },
  normalize(rawData) {
    return {
      ...rawData,
      source: "docsAdapter",
      type: "article",
      siteName: rawData.platform
    };
  }
};

const metadata = parseMetadata(html, "https://docs.example.com/guide", {
  adapters: [adapter]
});
```

`detect(url)` decides whether the adapter applies.

`extract(context)` reads HTML, parsed raw sources, URL, and options.

`normalize(rawData, context)` converts adapter-specific raw data into a normal MetaNova result contribution.

### YouTube Playlists

When a YouTube URL includes a playlist id, MetaNova returns:

```json
{
  "type": "playlist",
  "playlist": {
    "id": "...",
    "title": "...",
    "channel": {},
    "videos": [
      {
        "id": "...",
        "title": "...",
        "url": "https://www.youtube.com/watch?v=..."
      }
    ]
  }
}
```

That means a developer can do:

```ts
for (const video of metadata.playlist?.videos ?? []) {
  await fetchMetadata(video.url);
}
```

## Plugins

Plugins can register custom extractors, adapters, and image scorers.

```ts
import { MetaNova } from "metanova";

const plugin = {
  name: "internal-docs",
  setup(api) {
    api.addExtractor("docs-meta", ({ $ }) => ({
      source: "docs-meta",
      title: $("meta[name='doc:title']").attr("content"),
      siteName: "Internal Docs"
    }));

    api.addImageScorer((image) => (image.url.includes("/hero/") ? 12 : 0));
  }
};

MetaNova.use(plugin);
```

You can also pass plugins per call:

```ts
parseMetadata(html, "https://example.com", {
  plugins: [plugin]
});
```

## Error Handling

`fetchMetadata` returns `ok: false` for handled fetch failures.

```ts
const metadata = await fetchMetadata("https://example.com");

if (!metadata.ok) {
  console.error(metadata.diagnostics.errors);
}
```

Network failure example:

```json
{
  "ok": false,
  "type": "unknown",
  "confidence": 0,
  "diagnostics": {
    "errors": ["Request timed out."],
    "warnings": []
  }
}
```

Use `try/catch` around direct lower-level helpers such as `validateUrl` or `assertSafeRequestUrl`.

## Real Examples

After building the package, run:

```bash
npm install
npm run build
node examples/quick-start.mjs
node examples/commonjs.cjs
node examples/parse-html.mjs
node examples/preview-card.mjs
node examples/social-links.mjs
node examples/reddit.mjs
node examples/pinterest.mjs
node examples/behance.mjs
node examples/youtube.mjs
node examples/diagnostics.mjs
node examples/custom-plugin.mjs
node examples/custom-adapter.mjs
```

The examples above are mock examples: they use local HTML fixtures so they run deterministically without network.

Live network examples take a URL argument and do not contain built-in validation URLs:

```bash
node examples/live-fetch.mjs https://example.com
node examples/youtube-video.mjs https://example.com
node examples/youtube-playlist.mjs https://example.com
node examples/social-preview.mjs https://example.com
```

### Reddit Post

```ts
const metadata = parseMetadata(html, "https://www.reddit.com/r/typescript/comments/abc123/title/");
console.log(metadata.type); // social_post
console.log(metadata.siteName); // Reddit
```

### Pinterest Pin Or Short Link

```ts
parseMetadata(html, "https://www.pinterest.com/pin/123456789/");
detectShortUrl("https://pin.it/abc"); // { isShortUrl: true, provider: "Pinterest" }
```

### Behance Project

```ts
const metadata = parseMetadata(html, "https://www.behance.net/gallery/123456789/project");
console.log(metadata.type); // image
```

### YouTube Video

```ts
const metadata = parseMetadata(html, "https://youtu.be/dQw4w9WgXcQ");
console.log(metadata.type); // video
console.log(metadata.canonicalUrl); // https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

### Open Graph Page

```ts
const metadata = parseMetadata(`
  <meta property="og:title" content="Post">
  <meta property="og:description" content="Summary">
  <meta property="og:image" content="/cover.jpg">
`, "https://example.com/post");
```

Expected:

```json
{
  "type": "website",
  "title": "Post",
  "bestImage": "https://example.com/cover.jpg"
}
```

### Fallback-Only Page

```ts
const metadata = parseMetadata(`
  <title>Fallback</title>
  <meta name="description" content="No Open Graph here.">
  <img data-lazy-src="/fallback-cover.jpg" width="1200" height="630">
`, "https://example.com/fallback");
```

Expected:

```json
{
  "title": "Fallback",
  "description": "No Open Graph here.",
  "bestImage": "https://example.com/fallback-cover.jpg"
}
```

## Validation & Verification

Run the full quality suite:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm pack --dry-run
```

Verify examples:

```bash
node examples/quick-start.mjs
node examples/commonjs.cjs
node examples/parse-html.mjs
node examples/preview-card.mjs
node examples/social-links.mjs
node examples/reddit.mjs
node examples/pinterest.mjs
node examples/behance.mjs
node examples/youtube.mjs
node examples/diagnostics.mjs
node examples/custom-plugin.mjs
node examples/custom-adapter.mjs
```

What to inspect:

- JSON output has `ok`, `url`, `finalUrl`, `type`, `title`, `description`, `bestImage`, `confidence`, and media arrays.
- Diagnostics include `sourcesUsed`, `warnings`, `redirects`, and `selectedImageReason`.
- Image scoring puts large cover/social images ahead of logos, avatars, sprites, pixels, and placeholders.
- Adapters classify known social/media URLs correctly.
- Preview cards include `confidence`.

## Troubleshooting

### 403 Forbidden

Some sites block generic fetchers. Try a clear user agent:

```ts
fetchMetadata(url, {
  userAgent: "MyAppBot/1.0 (+https://example.com/bot)"
});
```

### Timeout

Increase `timeoutMs` or reduce work:

```ts
fetchMetadata(url, { timeoutMs: 15000, retries: 2 });
```

### No bestImage

Check:

- Does the page include image metadata?
- Are image URLs relative and resolvable?
- Were all candidates filtered as pixels/icons/placeholders?
- Inspect `metadata.images` and `metadata.diagnostics.warnings`.

### Blocked By Website

Some sites require browser rendering or authentication. MetaNova core intentionally does not use browser automation. Add a future rendering adapter outside the core package when needed.

### Invalid URL

Use `validateUrl`:

```ts
validateUrl("https://example.com");
```

Only `http:` and `https:` are allowed by default.

### Private IP Blocked

This is expected SSRF protection. For trusted local development:

```ts
fetchMetadata("http://127.0.0.1:3000", {
  allowLocalhost: true
});
```

### Missing Metadata

Use fallback extraction:

```ts
const metadata = parseMetadata(html, url, { includeRaw: true });
console.log(metadata.raw);
```

### CJS/ESM Import Issues

Build first:

```bash
npm run build
```

ESM:

```js
import { parseMetadata } from "metanova";
```

CommonJS:

```js
const { parseMetadata } = require("metanova");
```
