import type { MediaAsset } from "../types/index.js";
import { loadDocument, normalizeWhitespace, parseInteger, parseSrcset, uniqueMediaByUrl } from "../utils/html.js";
import { tryResolveUrl } from "../utils/url.js";

const LAZY_IMAGE_ATTRIBUTES = [
  "data-src",
  "data-original",
  "data-lazy-src",
  "data-image",
  "data-image-url",
  "data-og-image",
  "data-thumbnail",
  "data-thumb",
  "data-media",
  "data-full-src",
  "data-hi-res-src",
  "data-zoom-src",
  "data-poster",
  "data-bg"
];
const LAZY_IMAGE_SRCSET_ATTRIBUTES = ["data-srcset", "data-lazy-srcset", "data-original-srcset"];
const LAZY_MEDIA_ATTRIBUTES = ["data-src", "data-original", "data-lazy-src", "data-video", "data-video-url", "data-media", "data-playback-url"];

export function extractImages(html: string, baseUrl: string): MediaAsset[] {
  const $ = loadDocument(html);
  const images: MediaAsset[] = [];

  $("link[rel='image_src'][href]").each((_, element) => {
    pushResolved(images, {
      url: normalizeWhitespace($(element).attr("href")),
      kind: "image",
      source: "html"
    }, baseUrl);
  });

  $("link[rel][href]").each((_, element) => {
    const relTokens = (normalizeWhitespace($(element).attr("rel"))?.toLowerCase() ?? "").split(/\s+/);
    const asValue = normalizeWhitespace($(element).attr("as"))?.toLowerCase();
    const type = normalizeWhitespace($(element).attr("type"));
    if (!relTokens.includes("preload") && !relTokens.includes("prefetch")) {
      return;
    }

    if (asValue === "image" || type?.startsWith("image/")) {
      pushResolved(images, {
        url: normalizeWhitespace($(element).attr("href")),
        kind: "image",
        source: "html",
        type,
        metadata: { discoveredFrom: "link.preload" }
      }, baseUrl);

      for (const candidate of parseSrcset($(element).attr("imagesrcset"))) {
        pushResolved(images, {
          url: candidate,
          kind: "image",
          source: "html",
          type,
          metadata: { discoveredFrom: "link.imagesrcset" }
        }, baseUrl);
      }
    }
  });

  collectDocumentImages($, images, baseUrl, "html");

  $("video[poster]").each((_, element) => {
    pushResolved(images, {
      url: normalizeWhitespace($(element).attr("poster")),
      kind: "image",
      source: "html",
      width: parseInteger($(element).attr("width")),
      height: parseInteger($(element).attr("height")),
      metadata: {
        discoveredFrom: "video.poster"
      }
    }, baseUrl);
  });

  $("noscript").each((_, element) => {
    const fallbackHtml = $(element).html() || $(element).text();
    if (!fallbackHtml) {
      return;
    }

    collectDocumentImages(loadDocument(fallbackHtml), images, baseUrl, "fallback");
  });

  return uniqueMediaByUrl(images);
}

export function extractVideos(html: string, baseUrl: string): MediaAsset[] {
  const $ = loadDocument(html);
  const videos: MediaAsset[] = [];

  $("video").each((_, element) => {
    const src = normalizeWhitespace($(element).attr("src")) ?? firstAttribute($, element, LAZY_MEDIA_ATTRIBUTES);
    const common = {
      kind: "video" as const,
      source: "html",
      width: parseInteger($(element).attr("width")),
      height: parseInteger($(element).attr("height")),
      poster: tryResolveUrl(normalizeWhitespace($(element).attr("poster")), baseUrl)
    };

    pushResolved(videos, { ...common, url: src }, baseUrl);

    for (const attribute of LAZY_MEDIA_ATTRIBUTES) {
      pushResolved(videos, {
        ...common,
        url: normalizeWhitespace($(element).attr(attribute))
      }, baseUrl);
    }

    $(element)
      .find("source[src]")
      .each((_, source) => {
        pushResolved(videos, {
          ...common,
          url: normalizeWhitespace($(source).attr("src")),
          type: normalizeWhitespace($(source).attr("type"))
        }, baseUrl);
      });
  });

  $("iframe[src]").each((_, element) => {
    const src = normalizeWhitespace($(element).attr("src"));
    if (!src || !isLikelyVideoEmbed(src)) {
      return;
    }

    pushResolved(videos, {
      url: src,
      kind: "video",
      source: "html",
      width: parseInteger($(element).attr("width")),
      height: parseInteger($(element).attr("height"))
    }, baseUrl);
  });

  $("link[rel][href]").each((_, element) => {
    const relTokens = (normalizeWhitespace($(element).attr("rel"))?.toLowerCase() ?? "").split(/\s+/);
    const asValue = normalizeWhitespace($(element).attr("as"))?.toLowerCase();
    const type = normalizeWhitespace($(element).attr("type"));
    if ((!relTokens.includes("preload") && !relTokens.includes("prefetch")) || (asValue !== "video" && !type?.startsWith("video/"))) {
      return;
    }

    pushResolved(videos, {
      url: normalizeWhitespace($(element).attr("href")),
      kind: "video",
      source: "html",
      type,
      metadata: { discoveredFrom: "link.preload" }
    }, baseUrl);
  });

  return uniqueMediaByUrl(videos);
}

export function extractAudio(html: string, baseUrl: string): MediaAsset[] {
  const $ = loadDocument(html);
  const audio: MediaAsset[] = [];

  $("audio").each((_, element) => {
    pushResolved(audio, {
      url: normalizeWhitespace($(element).attr("src")),
      kind: "audio",
      source: "html"
    }, baseUrl);

    $(element)
      .find("source[src]")
      .each((_, source) => {
        pushResolved(audio, {
          url: normalizeWhitespace($(source).attr("src")),
          kind: "audio",
          source: "html",
          type: normalizeWhitespace($(source).attr("type"))
        }, baseUrl);
      });
  });

  return uniqueMediaByUrl(audio);
}

function pushResolved(assets: MediaAsset[], asset: Omit<MediaAsset, "url"> & { url?: string }, baseUrl: string): void {
  const url = tryResolveUrl(asset.url, baseUrl);
  if (!url || shouldIgnoreMediaUrl(url) || shouldIgnoreImageAsset(asset, url)) {
    return;
  }

  assets.push({
    ...asset,
    url
  });
}

function collectDocumentImages($: ReturnType<typeof loadDocument>, images: MediaAsset[], baseUrl: string, source: "html" | "fallback"): void {
  $("img").each((_, element) => {
    const common = {
      kind: "image" as const,
      source,
      width: parseInteger($(element).attr("width")),
      height: parseInteger($(element).attr("height")),
      alt: normalizeWhitespace($(element).attr("alt")),
      title: normalizeWhitespace($(element).attr("title"))
    };

    const candidates = [
      normalizeWhitespace($(element).attr("src")),
      ...LAZY_IMAGE_ATTRIBUTES.map((attribute) => normalizeWhitespace($(element).attr(attribute))),
      ...parseSrcset($(element).attr("srcset")),
      ...LAZY_IMAGE_SRCSET_ATTRIBUTES.flatMap((attribute) => parseSrcset($(element).attr(attribute)))
    ];

    for (const candidate of candidates) {
      pushResolved(images, {
        ...common,
        url: candidate,
        metadata: {
          discoveredFrom: source === "fallback" ? "noscript" : "img"
        }
      }, baseUrl);
    }
  });

  $("picture source[srcset], source[type^='image/'][srcset]").each((_, element) => {
    for (const candidate of [
      ...parseSrcset($(element).attr("srcset")),
      ...LAZY_IMAGE_SRCSET_ATTRIBUTES.flatMap((attribute) => parseSrcset($(element).attr(attribute)))
    ]) {
      pushResolved(images, {
        url: candidate,
        kind: "image",
        source,
        type: normalizeWhitespace($(element).attr("type")),
        metadata: {
          discoveredFrom: source === "fallback" ? "noscript.picture.source" : "picture.source"
        }
      }, baseUrl);
    }
  });
}

function shouldIgnoreMediaUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return (
    normalized.startsWith("data:") ||
    normalized.startsWith("blob:") ||
    normalized.startsWith("javascript:") ||
    /(?:sprite|spacer|blank|transparent|placeholder|tracking|beacon|pixel)(?:[._/-]|$|\?)/i.test(normalized) ||
    /(?:^|[/?_-])1x1(?:[._/-]|$|\?)/i.test(normalized)
  );
}

function shouldIgnoreImageAsset(asset: Omit<MediaAsset, "url"> & { url?: string }, url: string): boolean {
  if (asset.kind !== "image" && asset.kind !== "favicon") {
    return false;
  }

  const width = asset.width;
  const height = asset.height;
  const normalizedUrl = url.toLowerCase();

  if (width !== undefined && height !== undefined) {
    if (width <= 2 || height <= 2) {
      return true;
    }

    if (width <= 64 && height <= 64 && /(?:icon|favicon|apple-touch-icon|sprite|logo|avatar)/i.test(normalizedUrl)) {
      return true;
    }
  }

  return false;
}

function isLikelyVideoEmbed(src: string): boolean {
  return /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|tiktok\.com|instagram\.com|facebook\.com|player\./i.test(src);
}

function firstAttribute($: ReturnType<typeof loadDocument>, element: unknown, attributes: string[]): string | undefined {
  for (const attribute of attributes) {
    const value = normalizeWhitespace($(element as never).attr(attribute));
    if (value) {
      return value;
    }
  }

  return undefined;
}
