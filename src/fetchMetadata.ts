import { fetchPage } from "./fetcher/index.js";
import { parseMetadataAsync } from "./parse.js";
import type { FetchMetadataOptions, MediaAsset, UnifiedMetadata } from "./types/index.js";
import { detectImageDimensions } from "./utils/imageDimensions.js";
import { normalizeUrl } from "./utils/url.js";

export async function fetchMetadata(url: string, options: FetchMetadataOptions = {}): Promise<UnifiedMetadata> {
  const startedAt = Date.now();

  try {
    const requestedUrl = normalizeUrl(url);
    const firstPage = await fetchPage(requestedUrl, options);
    const fallback = await maybeFetchRedditFallback(firstPage, options);
    const page = fallback.page;
    const directMedia = createDirectMediaMetadata(page, requestedUrl, Date.now() - startedAt);
    if (directMedia) {
      return directMedia;
    }

    const metadata = await parseMetadataAsync(page.html, page.finalUrl, options);

    metadata.url = requestedUrl;
    metadata.finalUrl = page.finalUrl;
    metadata.ok = page.statusCode >= 200 && page.statusCode < 300;
    metadata.diagnostics.statusCode = page.statusCode;
    metadata.diagnostics.contentType = page.contentType;
    metadata.diagnostics.originalUrl = requestedUrl;
    metadata.diagnostics.finalUrl = page.finalUrl;
    metadata.diagnostics.canonicalUrl = metadata.canonicalUrl;
    metadata.diagnostics.isShortUrl = page.isShortUrl;
    metadata.diagnostics.shortUrlProvider = page.shortUrlProvider;
    metadata.diagnostics.redirects = page.redirects;
    metadata.diagnostics.fetchDurationMs = Date.now() - startedAt;
    metadata.diagnostics.trace = [
      ...(page.isShortUrl ? [`detected short URL provider: ${page.shortUrlProvider ?? "unknown"}`] : []),
      ...(page.redirects.length > 0 ? [`resolved ${page.redirects.length} redirect${page.redirects.length === 1 ? "" : "s"}`] : []),
      ...(fallback.used ? ["retried Reddit page through old.reddit fallback"] : []),
      "downloaded page",
      ...metadata.diagnostics.trace,
      ...(metadata.canonicalUrl ? ["resolved canonical URL"] : [])
    ];
    metadata.trace = metadata.diagnostics.trace;

    if (!metadata.ok) {
      metadata.diagnostics.warnings.push(`Fetch completed with non-success status code ${page.statusCode}.`);
    }

    if (page.contentType && !/html|xml|text/i.test(page.contentType)) {
      metadata.diagnostics.warnings.push(`Response content type may not contain parseable metadata: ${page.contentType}.`);
    }

    return metadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const safeUrl = safeNormalize(url);

    return {
      ok: false,
      url: safeUrl,
      finalUrl: safeUrl,
      type: "unknown",
      confidence: 0,
      completeness: 0,
      reliability: 0,
      images: [],
      videos: [],
      audio: [],
      favicons: [],
      trace: ["fetch failed"],
      diagnostics: {
        originalUrl: safeUrl,
        finalUrl: safeUrl,
        redirects: [],
        sourcesUsed: [],
        warnings: [],
        trace: ["fetch failed"],
        errors: [message],
        fetchDurationMs: Date.now() - startedAt,
        extractedAt: new Date().toISOString()
      }
    };
  }
}

async function maybeFetchRedditFallback(
  page: Awaited<ReturnType<typeof fetchPage>>,
  options: FetchMetadataOptions
): Promise<{ page: Awaited<ReturnType<typeof fetchPage>>; used: boolean }> {
  let parsed: URL;
  try {
    parsed = new URL(page.finalUrl);
  } catch {
    return { page, used: false };
  }

  const host = parsed.hostname.toLowerCase();
  const isReddit = host === "www.reddit.com" || host === "reddit.com" || host.endsWith(".reddit.com");
  const isOldReddit = host === "old.reddit.com";
  const looksLikeVerification = /please wait for verification|blocked|whoa there, pardner/i.test(page.html);
  const hasUsefulPreview = /og:(?:title|image|description)|twitter:(?:title|image|description)/i.test(page.html);

  if (!isReddit || isOldReddit || hasUsefulPreview || !looksLikeVerification) {
    return { page, used: false };
  }

  const fallbackUrl = new URL(page.finalUrl);
  fallbackUrl.hostname = "old.reddit.com";
  fallbackUrl.search = "";

  try {
    const fallbackPage = await fetchPage(fallbackUrl.toString(), options);
    return { page: fallbackPage, used: true };
  } catch {
    return { page, used: false };
  }
}

function createDirectMediaMetadata(
  page: Awaited<ReturnType<typeof fetchPage>>,
  requestedUrl: string,
  fetchDurationMs: number
): UnifiedMetadata | undefined {
  const contentType = page.contentType?.toLowerCase() ?? "";
  const kind = directMediaKind(contentType, page.finalUrl);
  if (!kind) {
    return undefined;
  }

  const dimensions =
    kind === "image"
      ? {
          ...imageDimensionsFromUrl(page.finalUrl),
          ...detectImageDimensions(page.bytes, page.contentType)
        }
      : {};
  const asset: MediaAsset = {
    url: page.finalUrl,
    kind,
    source: "direct",
    type: page.contentType,
    width: dimensions.width,
    height: dimensions.height,
    score: kind === "image" ? 90 : undefined,
    confidence: kind === "image" ? 0.9 : undefined
  };

  const confidence = kind === "image" ? 82 : 70;
  const completeness = kind === "image" ? (dimensions.width && dimensions.height ? 60 : 45) : 35;

  const trace = [
    ...(page.redirects.length > 0 ? [`resolved ${page.redirects.length} redirect${page.redirects.length === 1 ? "" : "s"}`] : []),
    "downloaded direct media",
    `detected direct ${kind}`
  ];

  return {
    ok: page.statusCode >= 200 && page.statusCode < 300,
    url: requestedUrl,
    finalUrl: page.finalUrl,
    type: kind === "image" ? "image" : kind,
    confidence,
    completeness,
    reliability: Math.round((confidence + completeness) / 2),
    bestImage: kind === "image" ? page.finalUrl : undefined,
    images: kind === "image" ? [asset] : [],
    videos: kind === "video" ? [asset] : [],
    audio: kind === "audio" ? [asset] : [],
    favicons: [],
    trace,
    sources: {
      image: kind === "image" ? "direct" : undefined
    },
    diagnostics: {
      originalUrl: requestedUrl,
      finalUrl: page.finalUrl,
      isShortUrl: page.isShortUrl,
      shortUrlProvider: page.shortUrlProvider,
      statusCode: page.statusCode,
      contentType: page.contentType,
      redirects: page.redirects,
      sourcesUsed: ["direct"],
      warnings: [],
      trace,
      selectedImageReason: kind === "image" ? "Selected direct image URL because the response content type is an image." : undefined,
      fetchDurationMs,
      extractedAt: new Date().toISOString()
    }
  };
}

function imageDimensionsFromUrl(url: string): { width?: number; height?: number } {
  try {
    const parsed = new URL(url);
    const width = parseDimension(parsed.searchParams.get("width") ?? parsed.searchParams.get("w"));
    const height = parseDimension(parsed.searchParams.get("height") ?? parsed.searchParams.get("h"));
    if (width && height) {
      return { width, height };
    }

    const crop = parsed.searchParams.get("crop");
    const cropMatch = crop?.match(/(\d{2,5})\s*:\s*(\d{2,5})/);
    if (cropMatch) {
      return { width: Number(cropMatch[1]), height: Number(cropMatch[2]) };
    }
  } catch {
    return {};
  }

  return {};
}

function parseDimension(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function directMediaKind(contentType: string, url: string): "image" | "video" | "audio" | undefined {
  const normalizedUrl = url.toLowerCase();

  if (contentType.startsWith("image/") || /\.(?:avif|webp|png|jpe?g|gif)(?:[?#].*)?$/i.test(normalizedUrl)) {
    return "image";
  }

  if (contentType.startsWith("video/") || /\.(?:mp4|webm|m3u8|mov)(?:[?#].*)?$/i.test(normalizedUrl)) {
    return "video";
  }

  if (contentType.startsWith("audio/") || /\.(?:mp3|m4a|wav|ogg|aac)(?:[?#].*)?$/i.test(normalizedUrl)) {
    return "audio";
  }

  return undefined;
}

function safeNormalize(url: string): string {
  try {
    return normalizeUrl(url);
  } catch {
    return url;
  }
}
