import { fetchPage, type FetchedPage } from "./fetcher/index.js";
import { parseMetadataAsync } from "./parse.js";
import type { ExtractionFallbackAttempt, ExtractionRetryInfo, FetchMetadataOptions, MediaAsset, ProviderDiagnostics, UnifiedMetadata } from "./types/index.js";
import { detectImageDimensions } from "./utils/imageDimensions.js";
import { isAllowedRedditImageCandidate, prioritizeRedditImages, redditImagePriority } from "./utils/redditMedia.js";
import { normalizeUrl } from "./utils/url.js";

const REDDIT_BLOCKED_METADATA_WARNING = "Reddit returned a verification/block page; metadata is incomplete.";
const PROVIDER_BLOCKED_SUGGESTED_ACTION = "retry_on_different_host_or_use_supported_proxy";

interface FetchStrategyResult {
  page: FetchedPage;
  fallbacksAttempted: ExtractionFallbackAttempt[];
  warnings: string[];
  trace: string[];
  sourcePriority?: string[];
  extractionMethod?: string;
  retryInfo?: ExtractionRetryInfo;
  providerDiagnostics?: ProviderDiagnostics;
}

type RedditBlockReason = "provider_verification_required" | "provider_blocked_request";

interface RedditFetchAttempt extends ExtractionFallbackAttempt {
  page?: FetchedPage;
  blockReason?: RedditBlockReason;
}

interface RedditPostPayload {
  title?: string;
  description?: string;
  author?: string;
  createdAt?: string;
  canonicalUrl?: string;
  url?: string;
  images: MediaAsset[];
  videos: MediaAsset[];
  subreddit?: string;
  postId?: string;
}

export async function fetchMetadata(url: string, options: FetchMetadataOptions = {}): Promise<UnifiedMetadata> {
  const startedAt = Date.now();

  try {
    const requestedUrl = normalizeUrl(url);
    const fetchResult = await fetchPageWithStrategies(requestedUrl, options);
    const page = fetchResult.page;
    if (fetchResult.providerDiagnostics?.blocked) {
      return createBlockedProviderMetadata(requestedUrl, fetchResult, Date.now() - startedAt);
    }

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
      ...fetchResult.trace,
      "downloaded page",
      ...metadata.diagnostics.trace,
      ...(metadata.canonicalUrl ? ["resolved canonical URL"] : [])
    ];
    metadata.diagnostics.fallbacksAttempted = mergeFallbackAttempts(metadata.diagnostics.fallbacksAttempted, fetchResult.fallbacksAttempted);
    metadata.diagnostics.sourcePriority = uniqueStrings([...(metadata.diagnostics.sourcePriority ?? []), ...(fetchResult.sourcePriority ?? [])]);
    metadata.diagnostics.extractionMethod = metadata.diagnostics.extractionMethod ?? fetchResult.extractionMethod;
    metadata.diagnostics.retryInfo = metadata.diagnostics.retryInfo ?? fetchResult.retryInfo;
    metadata.trace = metadata.diagnostics.trace;
    metadata.diagnostics.warnings.push(...fetchResult.warnings);

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

function createBlockedProviderMetadata(
  requestedUrl: string,
  fetchResult: FetchStrategyResult,
  fetchDurationMs: number
): UnifiedMetadata {
  const page = fetchResult.page;
  const providerDiagnostics = fetchResult.providerDiagnostics;
  const trace = uniqueStrings([
    ...(page.isShortUrl ? [`detected short URL provider: ${page.shortUrlProvider ?? "unknown"}`] : []),
    ...(page.redirects.length > 0 ? [`resolved ${page.redirects.length} redirect${page.redirects.length === 1 ? "" : "s"}`] : []),
    ...fetchResult.trace,
    "detected blocked provider response"
  ]);
  const warnings = uniqueStrings([
    ...fetchResult.warnings,
    REDDIT_BLOCKED_METADATA_WARNING,
    ...(page.statusCode < 200 || page.statusCode >= 300 ? [`Fetch completed with non-success status code ${page.statusCode}.`] : [])
  ]);

  return {
    ok: false,
    url: requestedUrl,
    finalUrl: page.finalUrl,
    type: "unknown",
    siteName: providerDiagnostics?.platform === "reddit" ? "Reddit" : undefined,
    confidence: 0,
    completeness: 0,
    reliability: 0,
    images: [],
    videos: [],
    audio: [],
    favicons: [],
    trace,
    diagnostics: {
      originalUrl: requestedUrl,
      finalUrl: page.finalUrl,
      isShortUrl: page.isShortUrl,
      shortUrlProvider: page.shortUrlProvider,
      statusCode: page.statusCode,
      contentType: page.contentType,
      redirects: page.redirects,
      sourcesUsed: [],
      warnings,
      fallbacksAttempted: mergeFallbackAttempts(undefined, fetchResult.fallbacksAttempted),
      trace,
      sourcePriority: fetchResult.sourcePriority,
      extractionMethod: fetchResult.extractionMethod,
      retryInfo: fetchResult.retryInfo,
      providerDiagnostics,
      confidenceBreakdown: {
        title: 0,
        description: 0,
        image: 0,
        structuredData: 0,
        adapter: 0
      },
      fetchDurationMs,
      extractedAt: new Date().toISOString()
    }
  };
}

async function fetchPageWithStrategies(requestedUrl: string, options: FetchMetadataOptions): Promise<FetchStrategyResult> {
  if (isRedditUrl(requestedUrl)) {
    return fetchRedditPageWithStrategy(requestedUrl, options);
  }

  return {
    page: await fetchPage(requestedUrl, options),
    fallbacksAttempted: [],
    warnings: [],
    trace: []
  };
}

async function fetchRedditPageWithStrategy(requestedUrl: string, options: FetchMetadataOptions): Promise<FetchStrategyResult> {
  const attempts: RedditFetchAttempt[] = [];
  const warnings: string[] = [];
  const informationalFallbacks: string[] = [];
  const sourcePriority = ["redditJsonEndpoint", "oldReddit", "embeddedStructuredData", "openGraph", "html"];
  let lastError: unknown;

  const jsonUrl = redditJsonEndpoint(requestedUrl);
  if (jsonUrl) {
    const attempt = await attemptFetch("redditJsonEndpoint", jsonUrl, {
      ...options,
      accept: "application/json,text/html;q=0.8,*/*;q=0.5"
    });
    attempts.push(attempt);
    lastError = attempt.error;

    if (attempt.page && attempt.ok) {
      const redditPost = parseRedditJsonPayload(attempt.page.html);
      if (redditPost?.title) {
        return {
          page: synthesizeRedditJsonPage(attempt.page, requestedUrl, redditPost),
          fallbacksAttempted: attempts,
          warnings,
          trace: ["used Reddit JSON endpoint"],
          sourcePriority,
          extractionMethod: "reddit:jsonEndpoint",
          retryInfo: redditRetryInfo(attempts)
        };
      }

      warnings.push("Reddit JSON endpoint responded, but no post payload could be extracted.");
    } else if (attempt.blocked) {
      informationalFallbacks.push("Informational fallback: Reddit JSON endpoint appears to have blocked access; continuing with fallback extraction.");
    }
  }

  const oldRedditUrl = redditOldUrl(requestedUrl);
  if (oldRedditUrl && oldRedditUrl !== requestedUrl) {
    const attempt = await attemptFetch("oldReddit", oldRedditUrl, options);
    attempts.push(attempt);
    lastError = attempt.error;

    if (attempt.page && attempt.ok) {
      return {
        page: attempt.page,
        fallbacksAttempted: attempts,
        warnings,
        trace: [...informationalFallbacks, "retried Reddit page through old.reddit"],
        sourcePriority,
        extractionMethod: "reddit:oldReddit",
        retryInfo: redditRetryInfo(attempts)
      };
    }

    if (attempt.blocked) {
      warnings.push("old.reddit fallback appears to have been blocked.");
    }
  }

  const htmlAttempt = await attemptFetch("redditHtmlFallback", requestedUrl, options);
  attempts.push(htmlAttempt);
  lastError = htmlAttempt.error;

  if (htmlAttempt.page && htmlAttempt.ok) {
    return {
      page: htmlAttempt.page,
      fallbacksAttempted: attempts,
      warnings,
      trace: [...informationalFallbacks, "used Reddit HTML fallback"],
      sourcePriority,
      extractionMethod: "reddit:htmlFallback",
      retryInfo: redditRetryInfo(attempts)
    };
  }

  if (htmlAttempt.blocked) {
    warnings.push("Reddit HTML fallback appears to have been blocked; metadata may be incomplete.");
  }

  const providerDiagnostics = redditProviderDiagnosticsFromAttempts(attempts);
  if (providerDiagnostics) {
    return {
      page: synthesizeRedditBlockedPage(requestedUrl, attempts, providerDiagnostics),
      fallbacksAttempted: attempts,
      warnings: uniqueStrings([...warnings, REDDIT_BLOCKED_METADATA_WARNING]),
      trace: [...informationalFallbacks, "Reddit provider blocked metadata extraction"],
      sourcePriority,
      extractionMethod: "reddit:blockedProvider",
      retryInfo: redditRetryInfo(attempts),
      providerDiagnostics
    };
  }

  throw lastError ?? new Error("All Reddit extraction fetch attempts failed.");
}

async function attemptFetch(
  method: string,
  url: string,
  options: FetchMetadataOptions
): Promise<RedditFetchAttempt> {
  try {
    const page = await fetchPage(url, options);
    const retryAfter = page.headers["retry-after"];
    const blockReason = redditBlockReason(page);
    const blocked = Boolean(blockReason);

    return {
      method,
      url,
      ok: page.statusCode >= 200 && page.statusCode < 300 && !blocked,
      statusCode: page.statusCode,
      blocked,
      blockReason,
      retryAfter,
      page
    };
  } catch (error) {
    return {
      method,
      url,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function isRedditUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === "reddit.com" || host === "redd.it" || host.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

function redditJsonEndpoint(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const endpoint = new URL(url);
    endpoint.protocol = "https:";
    endpoint.hostname = "www.reddit.com";
    endpoint.search = "";

    if (host === "redd.it") {
      const postId = parsed.pathname.split("/").filter(Boolean)[0];
      if (!postId) {
        return undefined;
      }
      endpoint.pathname = `/comments/${postId}.json`;
    } else {
      endpoint.pathname = parsed.pathname.endsWith(".json")
        ? parsed.pathname
        : `${parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`}.json`;
    }

    endpoint.searchParams.set("raw_json", "1");
    return endpoint.toString();
  } catch {
    return undefined;
  }
}

function redditOldUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.protocol = "https:";
    parsed.hostname = "old.reddit.com";
    parsed.search = "";

    if (host === "redd.it") {
      const postId = parsed.pathname.split("/").filter(Boolean)[0];
      if (!postId) {
        return undefined;
      }
      parsed.pathname = `/comments/${postId}/`;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

function parseRedditJsonPayload(source: string): RedditPostPayload | undefined {
  try {
    const parsed = JSON.parse(source) as unknown;
    const post = findRedditPostRecord(parsed);
    if (!post) {
      return undefined;
    }

    const createdUtc = numberFromUnknown(post.created_utc);
    const permalink = stringFromUnknown(post.permalink);
    const canonicalUrl = permalink ? `https://www.reddit.com${permalink.startsWith("/") ? permalink : `/${permalink}`}` : undefined;
    const images = redditImagesFromPost(post);
    const videos = redditVideosFromPost(post);
    const description = firstText(
      stringFromUnknown(post.selftext),
      stringFromUnknown(post.selftext_html),
      stringFromUnknown(post.url_overridden_by_dest)
    );

    return {
      title: stringFromUnknown(post.title),
      description,
      author: stringFromUnknown(post.author) ?? stringFromUnknown(post.author_fullname),
      createdAt: createdUtc ? new Date(createdUtc * 1000).toISOString() : undefined,
      canonicalUrl,
      url: stringFromUnknown(post.url_overridden_by_dest) ?? stringFromUnknown(post.url),
      images,
      videos,
      subreddit: stringFromUnknown(post.subreddit_name_prefixed) ?? stringFromUnknown(post.subreddit),
      postId: stringFromUnknown(post.id)
    };
  } catch {
    return undefined;
  }
}

function findRedditPostRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRedditPostRecord(item);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.title === "string" && (typeof value.id === "string" || typeof value.name === "string")) {
    return value;
  }

  const children = isRecord(value.data) && Array.isArray(value.data.children) ? value.data.children : undefined;
  if (children) {
    for (const child of children) {
      if (isRecord(child) && isRecord(child.data) && (child.kind === "t3" || typeof child.data.title === "string")) {
        return child.data;
      }
    }
  }

  for (const childValue of Object.values(value).slice(0, 100)) {
    const found = findRedditPostRecord(childValue);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function redditImagesFromPost(post: Record<string, unknown>): MediaAsset[] {
  const images: MediaAsset[] = [
    ...redditGalleryImagesFromPost(post),
    ...redditDirectImagesFromPost(post)
  ];
  const preview = isRecord(post.preview) && Array.isArray(post.preview.images) ? post.preview.images : [];

  for (const image of preview) {
    if (!isRecord(image)) {
      continue;
    }

    const source = redditImageFromRecord(image.source, "previewOriginal");
    if (source) {
      images.push(source);
      continue;
    }

    const fallbackResolution = largestRedditImageRecord(Array.isArray(image.resolutions) ? image.resolutions : []);
    const fallback = redditImageFromRecord(fallbackResolution, "previewResolution");
    if (fallback) {
      images.push(fallback);
    }
  }

  const thumbnail = redditMediaUrl(stringFromUnknown(post.thumbnail));
  if (thumbnail && /^https?:\/\//i.test(thumbnail)) {
    const thumbnailAsset = redditImageAsset(thumbnail, undefined, undefined, "thumbnail");
    if (thumbnailAsset) {
      images.push(thumbnailAsset);
    }
  }

  return dedupeRedditImages(prioritizeRedditImages(images));
}

function redditGalleryImagesFromPost(post: Record<string, unknown>): MediaAsset[] {
  const mediaMetadata = isRecord(post.media_metadata) ? post.media_metadata : undefined;
  if (!mediaMetadata) {
    return [];
  }

  const galleryItems = isRecord(post.gallery_data) && Array.isArray(post.gallery_data.items) ? post.gallery_data.items : [];
  const orderedIds = galleryItems
    .map((item) => isRecord(item) ? stringFromUnknown(item.media_id) : undefined)
    .filter((item): item is string => Boolean(item));
  const seenIds = new Set<string>();
  const assets: MediaAsset[] = [];

  for (const id of orderedIds) {
    const asset = redditImageFromMediaMetadata(mediaMetadata[id], id);
    if (asset) {
      assets.push(asset);
      seenIds.add(id);
    }
  }

  for (const [id, value] of Object.entries(mediaMetadata)) {
    if (seenIds.has(id)) {
      continue;
    }

    const asset = redditImageFromMediaMetadata(value, id);
    if (asset) {
      assets.push(asset);
    }
  }

  return assets;
}

function redditDirectImagesFromPost(post: Record<string, unknown>): MediaAsset[] {
  const url = redditMediaUrl(stringFromUnknown(post.url_overridden_by_dest) ?? stringFromUnknown(post.url));
  if (!url || !isDirectRedditImageUrl(url)) {
    return [];
  }

  const previewSource = previewSourceRecord(post);
  const asset = redditImageAsset(
    url,
    numberFromUnknown(previewSource?.width),
    numberFromUnknown(previewSource?.height),
    "directImage"
  );

  return asset ? [asset] : [];
}

function redditImageFromMediaMetadata(value: unknown, mediaId: string): MediaAsset | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const source = isRecord(value.s) ? value.s : undefined;
  const url = redditMediaUrl(
    stringFromUnknown(source?.u) ??
    stringFromUnknown(source?.gif) ??
    stringFromUnknown(source?.mp4)
  );

  if (!url) {
    return undefined;
  }

  const asset = redditImageAsset(
    url,
    numberFromUnknown(source?.x) ?? numberFromUnknown(source?.width),
    numberFromUnknown(source?.y) ?? numberFromUnknown(source?.height),
    "gallery",
    stringFromUnknown(value.m)
  );

  return asset
    ? {
        ...asset,
        metadata: {
          ...asset.metadata,
          redditMediaId: mediaId
        }
      }
    : undefined;
}

function redditImageFromRecord(value: unknown, redditMediaKind: string): MediaAsset | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const url = redditMediaUrl(stringFromUnknown(value.url) ?? stringFromUnknown(value.u));
  if (!url) {
    return undefined;
  }

  return redditImageAsset(
    url,
    numberFromUnknown(value.width) ?? numberFromUnknown(value.x),
    numberFromUnknown(value.height) ?? numberFromUnknown(value.y),
    redditMediaKind
  );
}

function redditImageAsset(
  url: string,
  width: number | undefined,
  height: number | undefined,
  redditMediaKind: string,
  type?: string
): MediaAsset | undefined {
  const asset: MediaAsset = {
    url,
    kind: "image",
    source: "adapter",
    width,
    height,
    type,
    metadata: {
      adapter: "redditJsonEndpoint",
      originalSource: "redditJsonEndpoint",
      redditMediaKind
    }
  };

  return isAllowedRedditImageCandidate(asset) ? asset : undefined;
}

function largestRedditImageRecord(values: unknown[]): unknown {
  return values
    .filter(isRecord)
    .sort((left, right) =>
      (numberFromUnknown(right.width) ?? 0) * (numberFromUnknown(right.height) ?? 0) -
      (numberFromUnknown(left.width) ?? 0) * (numberFromUnknown(left.height) ?? 0)
    )[0];
}

function previewSourceRecord(post: Record<string, unknown>): Record<string, unknown> | undefined {
  const images = isRecord(post.preview) && Array.isArray(post.preview.images) ? post.preview.images : [];
  const firstImage = images.find(isRecord);
  return firstImage && isRecord(firstImage.source) ? firstImage.source : undefined;
}

function isDirectRedditImageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === "i.redd.it" || host === "preview.redd.it";
  } catch {
    return false;
  }
}

function dedupeRedditImages(images: MediaAsset[]): MediaAsset[] {
  const seen = new Set<string>();
  const unique: MediaAsset[] = [];

  for (const image of images) {
    if (seen.has(image.url)) {
      continue;
    }

    seen.add(image.url);
    unique.push(image);
  }

  return unique;
}

function redditVideosFromPost(post: Record<string, unknown>): MediaAsset[] {
  const videos: MediaAsset[] = [];
  const media = [post.media, post.secure_media].filter(isRecord);

  for (const item of media) {
    const redditVideo = isRecord(item.reddit_video) ? item.reddit_video : undefined;
    const url = redditMediaUrl(stringFromUnknown(redditVideo?.fallback_url) ?? stringFromUnknown(redditVideo?.hls_url) ?? stringFromUnknown(redditVideo?.dash_url));
    if (!url) {
      continue;
    }

    videos.push({
      url,
      kind: "video",
      source: "adapter",
      width: numberFromUnknown(redditVideo?.width),
      height: numberFromUnknown(redditVideo?.height),
      metadata: {
        adapter: "redditJsonEndpoint",
        originalSource: "redditJsonEndpoint"
      }
    });
  }

  return videos;
}

function synthesizeRedditJsonPage(jsonPage: FetchedPage, requestedUrl: string, post: RedditPostPayload): FetchedPage {
  const finalUrl = post.canonicalUrl ?? requestedUrl;
  const bestImage = post.images.slice().sort(
    (left, right) =>
      redditImagePriority(right) - redditImagePriority(left) ||
      ((right.width ?? 0) * (right.height ?? 0)) - ((left.width ?? 0) * (left.height ?? 0))
  )[0];
  const video = post.videos[0];
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    headline: post.title,
    description: post.description,
    author: post.author ? { "@type": "Person", name: post.author } : undefined,
    datePublished: post.createdAt,
    url: finalUrl,
    image: bestImage ? { "@type": "ImageObject", url: bestImage.url, width: bestImage.width, height: bestImage.height } : undefined,
    video: video ? { "@type": "VideoObject", contentUrl: video.url, width: video.width, height: video.height } : undefined
  };
  const embeddedPayload = {
    post: {
      postTitle: post.title,
      description: post.description,
      author: post.author ? { name: post.author } : undefined,
      createdAt: post.createdAt,
      canonicalUrl: finalUrl,
      previewImage: bestImage,
      media: {
        videoUrl: video?.url
      },
      images: post.images,
      videos: post.videos,
      subreddit: post.subreddit,
      postId: post.postId
    }
  };
  const html = [
    "<!doctype html><html><head>",
    `<title>${escapeHtml(post.title ?? "Reddit post")}</title>`,
    post.title ? `<meta property="og:title" content="${escapeHtml(post.title)}">` : "",
    post.description ? `<meta property="og:description" content="${escapeHtml(post.description)}">` : "",
    `<meta property="og:site_name" content="Reddit">`,
    `<meta property="og:url" content="${escapeHtml(finalUrl)}">`,
    bestImage ? `<meta property="og:image" content="${escapeHtml(bestImage.url)}">` : "",
    bestImage?.width ? `<meta property="og:image:width" content="${bestImage.width}">` : "",
    bestImage?.height ? `<meta property="og:image:height" content="${bestImage.height}">` : "",
    `<link rel="canonical" href="${escapeHtml(finalUrl)}">`,
    `<script type="application/ld+json">${safeJson(structuredData)}</script>`,
    `<script type="application/json" id="metanova-reddit-json">${safeJson(embeddedPayload)}</script>`,
    "</head><body></body></html>"
  ].join("");

  return {
    ...jsonPage,
    url: requestedUrl,
    originalUrl: requestedUrl,
    finalUrl,
    html,
    bytes: new TextEncoder().encode(html),
    contentType: "text/html; charset=utf-8",
    statusCode: jsonPage.statusCode
  };
}

function redditProviderDiagnosticsFromAttempts(attempts: RedditFetchAttempt[]): ProviderDiagnostics | undefined {
  const blockedAttempts = attempts.filter((attempt) => attempt.blocked);
  if (blockedAttempts.length === 0) {
    return undefined;
  }

  const selectedAttempt =
    blockedAttempts.find((attempt) => attempt.blockReason === "provider_verification_required") ??
    blockedAttempts.at(-1);

  return {
    platform: "reddit",
    blocked: true,
    statusCode: selectedAttempt?.statusCode,
    reason: selectedAttempt?.blockReason ?? "provider_blocked_request",
    suggestedAction: PROVIDER_BLOCKED_SUGGESTED_ACTION
  };
}

function synthesizeRedditBlockedPage(
  requestedUrl: string,
  attempts: RedditFetchAttempt[],
  providerDiagnostics: ProviderDiagnostics
): FetchedPage {
  const selectedPage =
    attempts.find((attempt) => attempt.blockReason === providerDiagnostics.reason)?.page ??
    attempts.slice().reverse().find((attempt) => attempt.page)?.page;

  return {
    url: requestedUrl,
    originalUrl: requestedUrl,
    finalUrl: requestedUrl,
    isShortUrl: selectedPage?.isShortUrl ?? false,
    shortUrlProvider: selectedPage?.shortUrlProvider,
    html: "",
    bytes: new Uint8Array(),
    statusCode: providerDiagnostics.statusCode ?? selectedPage?.statusCode ?? 403,
    contentType: selectedPage?.contentType,
    redirects: selectedPage?.redirects ?? [],
    headers: selectedPage?.headers ?? {}
  };
}

function redditBlockReason(page: FetchedPage): RedditBlockReason | undefined {
  const title = htmlTitle(page.html);
  const text = normalizeText(`${title ?? ""} ${page.html}`);

  if (/reddit\s*-\s*please wait for verification/i.test(title ?? "") || /please wait for verification|verification required|verify you are human/i.test(text)) {
    return "provider_verification_required";
  }

  if (
    page.statusCode === 403 ||
    page.statusCode === 429 ||
    /whoa there, pardner|request has been blocked|too many requests|forbidden|you're blocked|you are blocked|youre blocked|blocked by network security/i.test(text) ||
    /^blocked$/i.test(title ?? "")
  ) {
    return "provider_blocked_request";
  }

  return undefined;
}

function htmlTitle(html: string): string | undefined {
  return normalizeText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

function normalizeText(value: string | undefined): string {
  return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function redditRetryInfo(attempts: ExtractionFallbackAttempt[]): ExtractionRetryInfo | undefined {
  const blockedAttempts = attempts.filter((attempt) => attempt.blocked || attempt.statusCode === 429 || attempt.statusCode === 403);
  if (blockedAttempts.length === 0) {
    return undefined;
  }

  const retryAfter = blockedAttempts.map((attempt) => attempt.retryAfter).find((value): value is string => Boolean(value));
  return {
    retryable: blockedAttempts.some((attempt) => attempt.statusCode === 429 || Boolean(attempt.retryAfter)),
    reason: blockedAttempts.map((attempt) => `${attempt.method}${attempt.statusCode ? ` returned ${attempt.statusCode}` : " failed"}`).join("; "),
    retryAfter,
    retryAfterMs: retryAfterToMs(retryAfter),
    attempts: attempts.length
  };
}

function retryAfterToMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(dateMs - Date.now(), 0) : undefined;
}

function mergeFallbackAttempts(
  existing: ExtractionFallbackAttempt[] | undefined,
  incoming: ExtractionFallbackAttempt[]
): ExtractionFallbackAttempt[] | undefined {
  const attempts = [...(existing ?? []), ...incoming];
  if (attempts.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  return attempts.map((value) => {
    const { page: _page, blockReason: _blockReason, ...attempt } = value as RedditFetchAttempt;
    return attempt;
  }).filter((attempt) => {
    const key = `${attempt.method}:${attempt.url ?? ""}:${attempt.statusCode ?? ""}:${attempt.error ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function redditMediaUrl(value: string | undefined): string | undefined {
  return value?.replace(/&amp;/g, "&");
}

function firstText(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.replace(/\s+/g, " ").trim()).find((value): value is string => Boolean(value));
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeJson(value: unknown): string {
  return JSON.stringify(stripUndefinedDeep(value)).replace(/</g, "\\u003c");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep).filter((item) => item !== undefined);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, stripUndefinedDeep(item)] as const)
        .filter(([, item]) => item !== undefined && item !== null && (!Array.isArray(item) || item.length > 0))
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      extractionMethod: `direct:${kind}`,
      selectedImageReason: kind === "image" ? "Selected direct image URL because the response content type is an image." : undefined,
      confidenceBreakdown: {
        title: 0,
        description: 0,
        image: kind === "image" ? 100 : 0,
        structuredData: 0,
        adapter: 0
      },
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
