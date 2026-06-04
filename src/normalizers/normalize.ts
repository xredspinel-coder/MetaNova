import type {
  AdapterExtractionResult,
  ApplicationMetadata,
  ArticleMetadata,
  ExtractionFallbackAttempt,
  Entity,
  ExtractionDiagnostics,
  ExtractionRetryInfo,
  ImageScorer,
  JsonLdNode,
  MediaAsset,
  MetadataType,
  ProductMetadata,
  RawMetadataSources,
  UnifiedMetadata
} from "../types/index.js";
import { firstDefined, parseNumber } from "../utils/html.js";
import { tryResolveUrl } from "../utils/url.js";
import { selectBestImage } from "../scorers/image.js";
import { discoverMedia } from "../media/index.js";
import { calculateCompleteness, calculateConfidence, calculateConfidenceBreakdown, calculateReliability } from "../engines/index.js";

export interface NormalizeContext {
  url?: string;
  finalUrl?: string;
  diagnostics?: ExtractionDiagnostics;
  imageScorers?: ImageScorer[];
  includeRaw?: boolean;
}

export function normalizeMetadata(rawSources: RawMetadataSources, context: NormalizeContext = {}): UnifiedMetadata {
  const finalUrl = context.finalUrl ?? context.url ?? "";
  const url = context.url ?? finalUrl;
  const externalResults = [...rawSources.plugins, ...rawSources.adapters];
  const jsonLdNodes = rawSources.jsonLd.nodes;
  const embeddedNodes = rawSources.embeddedData.items.map((item) => item.data);
  const articleNode = findJsonLdNode(jsonLdNodes, ["Article", "NewsArticle", "BlogPosting"]);
  const productNode = findJsonLdNode(jsonLdNodes, ["Product"]);
  const appNode = findJsonLdNode(jsonLdNodes, ["SoftwareApplication", "MobileApplication", "WebApplication"]);
  const organizationNode = findJsonLdNode(jsonLdNodes, ["Organization", "NewsMediaOrganization", "WebSite"]);
  const canonicalUrl = tryResolveUrl(
    firstDefined(
      firstResultValue(externalResults, (result) => result.canonicalUrl),
      rawSources.html.canonicalUrl,
      rawSources.openGraph.url,
      jsonString(jsonLdNodes, "url"),
      findStringByKeys(embeddedNodes, ["canonicalUrl", "canonical", "permalink", "pageUrl", "shareUrl"])
    ),
    finalUrl
  );

  const title = firstDefined(
    firstResultValue(externalResults, (result) => result.title),
    rawSources.openGraph.title,
    rawSources.twitter.title,
    jsonString([articleNode, productNode, appNode, organizationNode].filter(isJsonLdNode), "headline"),
    jsonString([articleNode, productNode, appNode, organizationNode].filter(isJsonLdNode), "name"),
    findStringByKeys(embeddedNodes, ["title", "headline", "pageTitle", "ogTitle", "name"]),
    rawSources.html.title
  );

  const description = firstDefined(
    firstResultValue(externalResults, (result) => result.description),
    rawSources.openGraph.description,
    rawSources.twitter.description,
    jsonString([articleNode, productNode, appNode, organizationNode].filter(isJsonLdNode), "description"),
    findStringByKeys(embeddedNodes, ["description", "excerpt", "summary", "subtitle", "ogDescription"]),
    rawSources.html.description
  );

  const siteName = firstDefined(
    firstResultValue(externalResults, (result) => result.siteName),
    rawSources.openGraph.siteName,
    jsonString([organizationNode].filter(isJsonLdNode), "name"),
    findStringByKeys(embeddedNodes, ["siteName", "site_name", "appName", "applicationName"]),
    domainName(finalUrl)
  );

  const mediaDiscovery = discoverMedia(rawSources, finalUrl);
  const images = mediaDiscovery.images;
  const videos = mediaDiscovery.videos;
  const audio = mediaDiscovery.audio;
  const favicons = normalizeAssets(rawSources.html.favicons, finalUrl);
  const selectedImage = selectBestImage(images, context.imageScorers);
  const article = mergeArticle(rawSources, externalResults, articleNode, embeddedNodes);
  const product = mergeProduct(rawSources, externalResults, productNode);
  const app = mergeApp(rawSources, externalResults, appNode);
  const video = mergeVideo(rawSources, externalResults, jsonLdNodes, embeddedNodes, videos);
  const playlist = mergePlaylist(externalResults);
  const type = inferType(rawSources, externalResults, jsonLdNodes, article, product, app, playlist, videos, audio);
  const author = firstResultValue(externalResults, (result) => result.author) ?? firstEntity(article?.authors) ?? entityFromEmbedded(embeddedNodes, ["author", "creator", "owner", "user"]);
  const publisher = article?.publisher ?? firstResultValue(externalResults, (result) => result.publisher) ?? entityFromJsonLd(organizationNode) ?? entityFromEmbedded(embeddedNodes, ["publisher", "provider", "organization"]);
  const publishDate = firstDefined(article?.publishedTime, video?.publishedTime);
  const sourcesUsed = detectSourcesUsed(rawSources);
  const warnings = diagnosticsWarnings(rawSources, externalResults, context.diagnostics);
  const fieldSources = {
    title: fieldSource(rawSources, externalResults, embeddedNodes, "title", selectedImage.best),
    description: fieldSource(rawSources, externalResults, embeddedNodes, "description", selectedImage.best),
    author: fieldSource(rawSources, externalResults, embeddedNodes, "author", selectedImage.best),
    image: fieldSource(rawSources, externalResults, embeddedNodes, "image", selectedImage.best)
  };
  const confidenceInput = {
    title,
    description,
    bestImage: selectedImage.best,
    canonicalUrl,
    hasStructuredData: jsonLdNodes.length > 0,
    rawSources,
    sourcesUsed,
    warnings
  };
  const confidence = calculateConfidence(confidenceInput);
  const confidenceBreakdown = calculateConfidenceBreakdown(confidenceInput);
  const completeness = calculateCompleteness({
    title,
    description,
    bestImage: selectedImage.best,
    canonicalUrl,
    siteName,
    author,
    publisher,
    type,
    publishedTime: publishDate,
    mediaCount: images.length + videos.length + audio.length
  });
  const reliability = calculateReliability({
    confidence,
    completeness,
    adapterMatched: rawSources.adapters.length > 0,
    bestImage: selectedImage.best,
    warnings
  });
  const diagnostics = context.diagnostics ?? {
    redirects: [],
    sourcesUsed: [],
    warnings: [],
    trace: [],
    extractedAt: new Date().toISOString()
  };

  diagnostics.sourcesUsed = uniqueStrings([...diagnostics.sourcesUsed, ...sourcesUsed]);
  diagnostics.warnings = uniqueStrings([...diagnostics.warnings, ...rawSources.jsonLd.warnings, ...externalResults.flatMap((result) => result.warnings ?? [])]);
  diagnostics.adapterUsed = diagnostics.adapterUsed ?? rawSources.adapters[0]?.source;
  diagnostics.extractionMethod = diagnostics.extractionMethod ?? adapterRawString(rawSources.adapters[0], "extractionMethod") ?? fieldSources.title;
  diagnostics.sourcePriority = uniqueStrings([
    ...(diagnostics.sourcePriority ?? []),
    ...(arrayOfStrings(rawSources.adapters[0]?.raw?.sourcePriority) ?? [])
  ]);
  diagnostics.fallbacksAttempted = mergeFallbackAttempts(
    diagnostics.fallbacksAttempted,
    fallbackAttemptsFromUnknown(rawSources.adapters[0]?.raw?.fallbacksAttempted)
  );
  diagnostics.retryInfo = diagnostics.retryInfo ?? retryInfoFromUnknown(rawSources.adapters[0]?.raw?.retryInfo);
  diagnostics.selectedImageReason = selectedImage.reason;
  diagnostics.confidenceBreakdown = confidenceBreakdown;
  diagnostics.originalUrl = diagnostics.originalUrl ?? url;
  diagnostics.finalUrl = diagnostics.finalUrl ?? finalUrl;
  diagnostics.canonicalUrl = canonicalUrl;
  diagnostics.adapter = adapterDiagnostics(rawSources.adapters);
  diagnostics.trace = uniqueStrings([
    ...diagnostics.trace,
    ...mediaDiscovery.trace,
    ...(selectedImage.best ? [`selected image from ${sourceLabel(selectedImage.best)}`] : [])
  ]);

  return stripUndefined({
    ok: true,
    url,
    finalUrl,
    type,
    title,
    description,
    publishDate,
    siteName,
    canonicalUrl,
    confidence,
    completeness,
    reliability,
    bestImage: selectedImage.best?.url,
    images: selectedImage.images,
    videos,
    audio,
    favicons,
    article,
    product,
    video,
    playlist,
    author,
    publisher,
    app,
    sources: fieldSources,
    raw: context.includeRaw ? rawSources : undefined,
    diagnostics,
    trace: diagnostics.trace
  }) as UnifiedMetadata;
}

function normalizeAssets(assets: MediaAsset[], baseUrl: string): MediaAsset[] {
  return assets
    .map((asset) => {
      const secureUrl = tryResolveUrl(asset.secureUrl, baseUrl);
      const url = tryResolveUrl(secureUrl ?? asset.url, baseUrl);
      const poster = tryResolveUrl(asset.poster, baseUrl);

      if (!url) {
        return undefined;
      }

      return stripUndefined({
        ...asset,
        url,
        secureUrl,
        poster
      }) as MediaAsset;
    })
    .filter((asset): asset is MediaAsset => Boolean(asset));
}

function mergeArticle(
  rawSources: RawMetadataSources,
  externalResults: AdapterExtractionResult[],
  articleNode: JsonLdNode | undefined,
  embeddedNodes: JsonLdNode[]
): ArticleMetadata | undefined {
  const embeddedAuthor = entityFromEmbedded(embeddedNodes, ["author", "creator", "owner", "user"]);
  const embeddedPublisher = entityFromEmbedded(embeddedNodes, ["publisher", "provider", "organization"]);
  const article: ArticleMetadata = {
    ...rawSources.openGraph.article,
    ...mergePartialObjects(externalResults.map((result) => result.article)),
    headline: firstDefined(
      firstResultValue(externalResults, (result) => result.article?.headline),
      jsonString([articleNode].filter(isJsonLdNode), "headline"),
      findStringByKeys(embeddedNodes, ["headline", "title", "postTitle", "pinTitle", "projectTitle"]),
      rawSources.openGraph.article?.headline,
      rawSources.openGraph.title
    ),
    section: firstDefined(
      firstResultValue(externalResults, (result) => result.article?.section),
      rawSources.openGraph.article?.section,
      jsonString([articleNode].filter(isJsonLdNode), "articleSection")
    ),
    publishedTime: firstDefined(
      firstResultValue(externalResults, (result) => result.article?.publishedTime),
      rawSources.openGraph.article?.publishedTime,
      jsonString([articleNode].filter(isJsonLdNode), "datePublished"),
      findStringByKeys(embeddedNodes, ["datePublished", "publishedTime", "published_at", "createdAt", "created_at", "timestamp"])
    ),
    modifiedTime: firstDefined(
      firstResultValue(externalResults, (result) => result.article?.modifiedTime),
      rawSources.openGraph.article?.modifiedTime,
      jsonString([articleNode].filter(isJsonLdNode), "dateModified")
    ),
    expirationTime: firstDefined(
      firstResultValue(externalResults, (result) => result.article?.expirationTime),
      rawSources.openGraph.article?.expirationTime
    ),
    tags: uniqueStrings([
      ...(rawSources.openGraph.article?.tags ?? []),
      ...jsonKeywords(articleNode)
    ]),
    authors: firstDefined(
      firstResultValue(externalResults, (result) => result.article?.authors),
      rawSources.openGraph.article?.authors,
      entitiesFromJsonLd(articleNode?.author),
      embeddedAuthor ? [embeddedAuthor] : undefined
    ),
    publisher: firstDefined(
      firstResultValue(externalResults, (result) => result.article?.publisher),
      rawSources.openGraph.article?.publisher,
      entityFromJsonLd(articleNode?.publisher),
      embeddedPublisher
    )
  };

  return emptyToUndefined(article);
}

function mergeProduct(
  _rawSources: RawMetadataSources,
  externalResults: AdapterExtractionResult[],
  productNode: JsonLdNode | undefined
): ProductMetadata | undefined {
  const offers = firstRecord(productNode?.offers);
  const aggregateRating = firstRecord(productNode?.aggregateRating);
  const product: ProductMetadata = {
    ...mergePartialObjects(externalResults.map((result) => result.product)),
    name: firstDefined(firstResultValue(externalResults, (result) => result.product?.name), jsonString([productNode].filter(isJsonLdNode), "name")),
    brand: firstDefined(firstResultValue(externalResults, (result) => result.product?.brand), entityFromJsonLd(productNode?.brand)),
    sku: firstDefined(firstResultValue(externalResults, (result) => result.product?.sku), jsonString([productNode].filter(isJsonLdNode), "sku")),
    price: firstDefined(firstResultValue(externalResults, (result) => result.product?.price), jsonString([offers].filter(isJsonLdNode), "price")),
    currency: firstDefined(
      firstResultValue(externalResults, (result) => result.product?.currency),
      jsonString([offers].filter(isJsonLdNode), "priceCurrency")
    ),
    availability: firstDefined(
      firstResultValue(externalResults, (result) => result.product?.availability),
      shortSchemaValue(jsonString([offers].filter(isJsonLdNode), "availability"))
    ),
    condition: firstDefined(
      firstResultValue(externalResults, (result) => result.product?.condition),
      shortSchemaValue(jsonString([offers].filter(isJsonLdNode), "itemCondition"))
    ),
    ratingValue: firstDefined(
      firstResultValue(externalResults, (result) => result.product?.ratingValue),
      parseNumber(jsonString([aggregateRating].filter(isJsonLdNode), "ratingValue"))
    ),
    reviewCount: firstDefined(
      firstResultValue(externalResults, (result) => result.product?.reviewCount),
      parseNumber(jsonString([aggregateRating].filter(isJsonLdNode), "reviewCount"))
    )
  };

  return emptyToUndefined(product);
}

function mergeApp(
  rawSources: RawMetadataSources,
  externalResults: AdapterExtractionResult[],
  appNode: JsonLdNode | undefined
): ApplicationMetadata | undefined {
  const offers = firstRecord(appNode?.offers);
  const app: ApplicationMetadata = {
    ...mergePartialObjects(externalResults.map((result) => result.app)),
    name: firstDefined(
      firstResultValue(externalResults, (result) => result.app?.name),
      rawSources.html.applicationName,
      jsonString([appNode].filter(isJsonLdNode), "name")
    ),
    category: firstDefined(firstResultValue(externalResults, (result) => result.app?.category), jsonString([appNode].filter(isJsonLdNode), "applicationCategory")),
    operatingSystem: firstDefined(
      firstResultValue(externalResults, (result) => result.app?.operatingSystem),
      jsonString([appNode].filter(isJsonLdNode), "operatingSystem")
    ),
    price: firstDefined(firstResultValue(externalResults, (result) => result.app?.price), jsonString([offers].filter(isJsonLdNode), "price")),
    currency: firstDefined(firstResultValue(externalResults, (result) => result.app?.currency), jsonString([offers].filter(isJsonLdNode), "priceCurrency"))
  };

  return emptyToUndefined(app);
}

function mergeVideo(
  rawSources: RawMetadataSources,
  externalResults: AdapterExtractionResult[],
  jsonLdNodes: JsonLdNode[],
  embeddedNodes: JsonLdNode[],
  videos: MediaAsset[]
) {
  const externalVideo = mergePartialObjects(externalResults.map((result) => result.video));
  const hasExternalVideo = Object.keys(externalVideo).length > 0;
  const explicitExternalType = firstResultValue(externalResults, (result) => result.type);
  const videoNode = findJsonLdNode(jsonLdNodes, ["VideoObject"]);
  const openGraphType = rawSources.openGraph.type?.toLowerCase() ?? "";
  const canTrustEmbeddedVideo =
    !explicitExternalType ||
    explicitExternalType === "video" ||
    explicitExternalType === "playlist" ||
    openGraphType.includes("video") ||
    Boolean(videoNode);

  if (!hasExternalVideo && !canTrustEmbeddedVideo) {
    return undefined;
  }

  const canUseEmbeddedFallbacks = hasExternalVideo || canTrustEmbeddedVideo;
  const video = {
    ...externalVideo,
    id: firstDefined(
      firstResultValue(externalResults, (result) => result.video?.id),
      canUseEmbeddedFallbacks ? findStringByKeys([videoNode, ...embeddedNodes].filter(isJsonLdNode), ["videoId", "video_id"]) : undefined
    ),
    title: firstDefined(
      firstResultValue(externalResults, (result) => result.video?.title),
      jsonString([videoNode].filter(isJsonLdNode), "name"),
      canUseEmbeddedFallbacks ? rawSources.openGraph.title : undefined,
      canUseEmbeddedFallbacks ? findStringByKeys(embeddedNodes, ["videoTitle", "title"]) : undefined
    ),
    channel: firstDefined(firstResultValue(externalResults, (result) => result.video?.channel), entityFromEmbedded(embeddedNodes, ["channel", "ownerChannelName", "author"])),
    publishedTime: firstDefined(
      firstResultValue(externalResults, (result) => result.video?.publishedTime),
      jsonString([videoNode].filter(isJsonLdNode), "uploadDate"),
      canUseEmbeddedFallbacks ? findStringByKeys(embeddedNodes, ["publishDate", "publishedTime", "uploadDate", "datePublished"]) : undefined
    ),
    duration: firstDefined(
      firstResultValue(externalResults, (result) => result.video?.duration),
      jsonString([videoNode].filter(isJsonLdNode), "duration"),
      canUseEmbeddedFallbacks ? findStringByKeys(embeddedNodes, ["duration", "lengthSeconds"]) : undefined
    ),
    category: firstDefined(firstResultValue(externalResults, (result) => result.video?.category), canUseEmbeddedFallbacks ? findStringByKeys(embeddedNodes, ["category"]) : undefined),
    viewCount: firstDefined(
      firstResultValue(externalResults, (result) => result.video?.viewCount),
      canUseEmbeddedFallbacks ? parseNumber(findStringByKeys(embeddedNodes, ["viewCount", "views"])) : undefined
    ),
    tags: firstDefined(firstResultValue(externalResults, (result) => result.video?.tags), canUseEmbeddedFallbacks ? arrayOfStrings(findValueByKeys(embeddedNodes, ["tags", "keywords"])) : undefined)
  };

  const cleaned = emptyToUndefined(video);
  const hasUsefulVideoIdentity =
    Boolean(cleaned?.id) ||
    Boolean(cleaned?.duration) ||
    Boolean(cleaned?.channel) ||
    Boolean(cleaned?.publishedTime) ||
    videos.length > 0 ||
    rawSources.openGraph.videos.length > 0 ||
    rawSources.twitter.videos.length > 0 ||
    Boolean(videoNode);

  if (!cleaned || (!hasExternalVideo && !hasUsefulVideoIdentity)) {
    return undefined;
  }

  return cleaned;
}

function mergePlaylist(externalResults: AdapterExtractionResult[]) {
  const playlist = firstResultValue(externalResults, (result) => result.playlist);
  if (!playlist) {
    return undefined;
  }

  return {
    videos: [],
    ...playlist
  };
}

function inferType(
  rawSources: RawMetadataSources,
  externalResults: AdapterExtractionResult[],
  jsonLdNodes: JsonLdNode[],
  article: ArticleMetadata | undefined,
  product: ProductMetadata | undefined,
  app: ApplicationMetadata | undefined,
  playlist: unknown,
  videos: MediaAsset[],
  audio: MediaAsset[]
): MetadataType {
  const explicit = firstResultValue(externalResults, (result) => result.type);
  if (explicit) {
    return explicit;
  }

  if (playlist) {
    return "playlist";
  }

  const ogType = rawSources.openGraph.type?.toLowerCase();
  if (ogType?.includes("article") || article) {
    return "article";
  }

  if (ogType?.includes("product") || product || hasJsonLdType(jsonLdNodes, ["Product"])) {
    return "product";
  }

  if (ogType?.includes("image") || hasJsonLdType(jsonLdNodes, ["ImageObject"])) {
    return "image";
  }

  if (ogType?.includes("video") || videos.length > 0 || hasJsonLdType(jsonLdNodes, ["VideoObject"])) {
    return "video";
  }

  if (ogType?.includes("audio") || audio.length > 0 || hasJsonLdType(jsonLdNodes, ["AudioObject", "MusicRecording", "PodcastEpisode"])) {
    return "audio";
  }

  if (app || hasJsonLdType(jsonLdNodes, ["SoftwareApplication", "MobileApplication", "WebApplication"])) {
    return "app";
  }

  if (ogType?.includes("profile") || hasJsonLdType(jsonLdNodes, ["Person"])) {
    return "profile";
  }

  return rawSources.openGraph.raw["og:type"] || rawSources.html.title ? "website" : "unknown";
}

function detectSourcesUsed(rawSources: RawMetadataSources): string[] {
  const sources: string[] = [];

  if (Object.keys(rawSources.openGraph.raw).length > 0) {
    sources.push("openGraph");
  }

  if (Object.keys(rawSources.twitter.raw).length > 0) {
    sources.push("twitter");
  }

  if (rawSources.jsonLd.nodes.length > 0) {
    sources.push("jsonLd");
  }

  if (rawSources.embeddedData.items.length > 0) {
    sources.push("embeddedData", ...rawSources.embeddedData.items.map((item) => item.source));
  }

  if (rawSources.oEmbed.links.length > 0 || rawSources.oEmbed.data.length > 0) {
    sources.push("oEmbed");
  }

  if (rawSources.html.title || rawSources.html.description || rawSources.html.canonicalUrl) {
    sources.push("html");
  }

  if (rawSources.images.length > 0 || rawSources.videos.length > 0 || rawSources.audio.length > 0) {
    sources.push("media");
  }

  sources.push(...rawSources.adapters.map((result) => result.source), ...rawSources.plugins.map((result) => result.source));
  return sources;
}

function diagnosticsWarnings(
  rawSources: RawMetadataSources,
  externalResults: AdapterExtractionResult[],
  diagnostics: ExtractionDiagnostics | undefined
): string[] {
  return uniqueStrings([
    ...(diagnostics?.warnings ?? []),
    ...rawSources.jsonLd.warnings,
    ...externalResults.flatMap((result) => result.warnings ?? [])
  ]);
}

function adapterDiagnostics(adapters: AdapterExtractionResult[]): ExtractionDiagnostics["adapter"] {
  const adapter = adapters[0];
  if (!adapter) {
    return { matched: false };
  }

  let confidence = 55;
  if (adapter.title) {
    confidence += 15;
  }
  if (adapter.description) {
    confidence += 10;
  }
  if ((adapter.images?.length ?? 0) > 0 || (adapter.videos?.length ?? 0) > 0) {
    confidence += 15;
  }
  if (adapter.author) {
    confidence += 5;
  }

  return {
    matched: true,
    name: adapter.source,
    confidence: Math.min(confidence, 100)
  };
}

function adapterRawString(adapter: AdapterExtractionResult | undefined, key: string): string | undefined {
  const value = adapter?.raw?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fallbackAttemptsFromUnknown(value: unknown): ExtractionFallbackAttempt[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const attempts = value.flatMap((item): ExtractionFallbackAttempt[] => {
    if (!isJsonLdNode(item) || typeof item.method !== "string") {
      return [];
    }

    return [{
      method: item.method,
      url: typeof item.url === "string" ? item.url : undefined,
      ok: typeof item.ok === "boolean" ? item.ok : false,
      statusCode: typeof item.statusCode === "number" ? item.statusCode : undefined,
      blocked: typeof item.blocked === "boolean" ? item.blocked : undefined,
      error: typeof item.error === "string" ? item.error : undefined,
      retryAfter: typeof item.retryAfter === "string" ? item.retryAfter : undefined
    }];
  });

  return attempts.length > 0 ? attempts : undefined;
}

function mergeFallbackAttempts(
  existing: ExtractionFallbackAttempt[] | undefined,
  incoming: ExtractionFallbackAttempt[] | undefined
): ExtractionFallbackAttempt[] | undefined {
  const attempts = [...(existing ?? []), ...(incoming ?? [])];
  if (attempts.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  return attempts.filter((attempt) => {
    const key = `${attempt.method}:${attempt.url ?? ""}:${attempt.statusCode ?? ""}:${attempt.error ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function retryInfoFromUnknown(value: unknown): ExtractionRetryInfo | undefined {
  if (!isJsonLdNode(value)) {
    return undefined;
  }

  const retryable = typeof value.retryable === "boolean" ? value.retryable : undefined;
  if (retryable === undefined) {
    return undefined;
  }

  return {
    retryable,
    reason: typeof value.reason === "string" ? value.reason : undefined,
    retryAfter: typeof value.retryAfter === "string" ? value.retryAfter : undefined,
    retryAfterMs: typeof value.retryAfterMs === "number" ? value.retryAfterMs : undefined,
    attempts: typeof value.attempts === "number" ? value.attempts : undefined
  };
}

function fieldSource(
  rawSources: RawMetadataSources,
  externalResults: AdapterExtractionResult[],
  embeddedNodes: JsonLdNode[],
  field: "title" | "description" | "author" | "image",
  bestImage: MediaAsset | undefined
): string | undefined {
  if (field === "image") {
    return bestImage ? sourceLabel(bestImage) : undefined;
  }

  for (const result of externalResults) {
    if (field === "title" && result.title) {
      return result.source;
    }
    if (field === "description" && result.description) {
      return result.source;
    }
    if (field === "author" && result.author) {
      return result.source;
    }
  }

  if (field === "title") {
    if (rawSources.openGraph.title) return "openGraph";
    if (rawSources.twitter.title) return "twitter";
    if (findStringByKeys(embeddedNodes, ["title", "headline", "name"])) return "embeddedData";
    if (rawSources.html.title) return "html";
  }

  if (field === "description") {
    if (rawSources.openGraph.description) return "openGraph";
    if (rawSources.twitter.description) return "twitter";
    if (findStringByKeys(embeddedNodes, ["description", "summary", "excerpt"])) return "embeddedData";
    if (rawSources.html.description) return "html";
  }

  if (field === "author") {
    if (entityFromEmbedded(embeddedNodes, ["author", "creator", "owner", "user"])) return "embeddedData";
    if (rawSources.openGraph.article?.authors?.length) return "openGraph";
  }

  return undefined;
}

function findJsonLdNode(nodes: JsonLdNode[], types: string[]): JsonLdNode | undefined {
  return nodes.find((node) => hasJsonLdType([node], types));
}

function hasJsonLdType(nodes: JsonLdNode[], types: string[]): boolean {
  return nodes.some((node) => {
    const nodeTypes = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    return nodeTypes.some((type) => typeof type === "string" && types.some((candidate) => type.toLowerCase().endsWith(candidate.toLowerCase())));
  });
}

function jsonString(nodes: JsonLdNode[], key: string): string | undefined {
  for (const node of nodes) {
    const value = stringFromUnknown(node[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function findStringByKeys(nodes: JsonLdNode[], keys: string[]): string | undefined {
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  const candidates: string[] = [];

  for (const node of nodes) {
    walkJson(node, (value, key) => {
      if (!key || !normalizedKeys.includes(key.toLowerCase())) {
        return;
      }

      const text = stringFromUnknown(value);
      if (text) {
        candidates.push(text);
      }
    });
  }

  return candidates
    .filter((candidate) => candidate.length >= 2 && !/^\d+$/.test(candidate))
    .sort((left, right) => scoreTextCandidate(right) - scoreTextCandidate(left))[0];
}

function findValueByKeys(nodes: JsonLdNode[], keys: string[]): unknown {
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  let found: unknown;

  for (const node of nodes) {
    walkJson(node, (value, key) => {
      if (found !== undefined || !key || !normalizedKeys.includes(key.toLowerCase())) {
        return;
      }

      found = value;
    });

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function entityFromEmbedded(nodes: JsonLdNode[], keys: string[]): Entity | undefined {
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  const candidates: Entity[] = [];

  for (const node of nodes) {
    walkJson(node, (value, key) => {
      if (!key || !normalizedKeys.some((candidate) => key.toLowerCase().includes(candidate))) {
        return;
      }

      const entity = entityFromJsonLd(value);
      if (entity?.name) {
        candidates.push(entity);
      }
    });
  }

  return candidates[0];
}

function walkJson(value: unknown, visit: (value: unknown, key?: string) => void, key?: string, depth = 0): void {
  if (depth > 8) {
    return;
  }

  visit(value, key);

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 250)) {
      walkJson(item, visit, undefined, depth + 1);
    }
    return;
  }

  if (isJsonLdNode(value)) {
    for (const [childKey, childValue] of Object.entries(value).slice(0, 500)) {
      walkJson(childValue, visit, childKey, depth + 1);
    }
  }
}

function scoreTextCandidate(value: string): number {
  let score = Math.min(value.length, 160);
  if (value.length >= 12 && value.length <= 120) {
    score += 50;
  }
  if (/^(home|login|index|untitled)$/i.test(value)) {
    score -= 80;
  }
  return score;
}

function jsonKeywords(node: JsonLdNode | undefined): string[] {
  const value = node?.keywords;
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(stringFromUnknown).filter((item): item is string => Boolean(item));
  }

  const text = stringFromUnknown(value);
  return text ? text.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function entityFromJsonLd(value: unknown): Entity | undefined {
  const entity = firstRecord(value);
  if (!entity) {
    const name = stringFromUnknown(value);
    return name ? { name } : undefined;
  }

  return emptyToUndefined({
    name: stringFromUnknown(entity.name),
    url: stringFromUnknown(entity.url),
    logo: stringFromUnknown(entity.logo),
    sameAs: arrayOfStrings(entity.sameAs)
  });
}

function entitiesFromJsonLd(value: unknown): Entity[] | undefined {
  if (Array.isArray(value)) {
    const entities = value.map(entityFromJsonLd).filter((entity): entity is Entity => Boolean(entity));
    return entities.length > 0 ? entities : undefined;
  }

  const entity = entityFromJsonLd(value);
  return entity ? [entity] : undefined;
}

function firstRecord(value: unknown): JsonLdNode | undefined {
  if (Array.isArray(value)) {
    return value.find(isJsonLdNode);
  }

  return isJsonLdNode(value) ? value : undefined;
}

function firstResultValue<T>(results: AdapterExtractionResult[], select: (result: AdapterExtractionResult) => T | undefined): T | undefined {
  for (const result of results) {
    const value = select(result);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function firstEntity(entities: Entity[] | undefined): Entity | undefined {
  return entities?.[0];
}

function mergePartialObjects<T extends object>(objects: Array<Partial<T> | undefined>): Partial<T> {
  return Object.assign({}, ...objects.filter(Boolean));
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(stringFromUnknown).find(Boolean);
  }

  if (isJsonLdNode(value)) {
    return stringFromUnknown(value.name) ?? stringFromUnknown(value.url) ?? stringFromUnknown(value["@id"]);
  }

  return undefined;
}

function arrayOfStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    const single = stringFromUnknown(value);
    return single ? [single] : undefined;
  }

  const values = value.map(stringFromUnknown).filter((item): item is string => Boolean(item));
  return values.length > 0 ? values : undefined;
}

function shortSchemaValue(value: string | undefined): string | undefined {
  return value?.split("/").filter(Boolean).at(-1);
}

function domainName(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function emptyToUndefined<T extends object>(value: T): T | undefined {
  const cleaned = stripUndefined(value) as T;
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && (!Array.isArray(item) || item.length > 0))) as Partial<T>;
}

function isJsonLdNode(value: unknown): value is JsonLdNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourceLabel(image: MediaAsset): string {
  if (image.source === "adapter") {
    const adapter = typeof image.metadata?.adapter === "string" ? image.metadata.adapter : "adapter";
    const originalSource = typeof image.metadata?.originalSource === "string" ? image.metadata.originalSource : undefined;
    return originalSource ? `${adapter} (${originalSource})` : adapter;
  }

  return image.source;
}
