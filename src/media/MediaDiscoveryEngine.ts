import type { EmbeddedDataItem, JsonLdNode, MediaAsset, RawMetadataSources } from "../types/index.js";
import { parseNumber, uniqueMediaByUrl } from "../utils/html.js";
import { tryResolveUrl } from "../utils/url.js";

export interface MediaDiscoveryResult {
  images: MediaAsset[];
  videos: MediaAsset[];
  audio: MediaAsset[];
  trace: string[];
}

const IMAGE_KEYS = [
  "image",
  "images",
  "thumbnail",
  "thumbnailUrl",
  "thumbnail_url",
  "thumbnailSrc",
  "previewImage",
  "preview_image",
  "ogImage",
  "cardImage",
  "cover",
  "coverImage",
  "poster",
  "media"
];

const VIDEO_KEYS = ["video", "videos", "videoUrl", "video_url", "contentUrl", "embedUrl", "playbackUrl"];
const AUDIO_KEYS = ["audio", "audios", "audioUrl", "audio_url", "podcastUrl"];

export function discoverMedia(rawSources: RawMetadataSources, finalUrl: string): MediaDiscoveryResult {
  const trace: string[] = [];
  const externalResults = [...rawSources.plugins, ...rawSources.adapters];
  const images = normalizeAssets(
    [
      ...externalResults.flatMap((result) => result.images ?? []),
      ...rawSources.openGraph.images,
      ...rawSources.twitter.images,
      ...jsonLdImages(rawSources.jsonLd.nodes),
      ...embeddedImages(rawSources.embeddedData.items),
      ...(rawSources.html.imageSrc ? [rawSources.html.imageSrc] : []),
      ...rawSources.images,
      ...oEmbedImages(rawSources)
    ],
    finalUrl
  );
  const videos = normalizeAssets(
    [
      ...externalResults.flatMap((result) => result.videos ?? []),
      ...rawSources.openGraph.videos,
      ...rawSources.twitter.videos,
      ...jsonLdVideos(rawSources.jsonLd.nodes),
      ...embeddedVideos(rawSources.embeddedData.items),
      ...rawSources.videos
    ],
    finalUrl
  );
  const audio = normalizeAssets(
    [
      ...externalResults.flatMap((result) => result.audio ?? []),
      ...rawSources.openGraph.audio,
      ...jsonLdAudio(rawSources.jsonLd.nodes),
      ...embeddedAudio(rawSources.embeddedData.items),
      ...rawSources.audio
    ],
    finalUrl
  );

  if (rawSources.openGraph.images.length > 0) {
    trace.push("media discovery collected og:image candidates");
  }
  if (rawSources.twitter.images.length > 0) {
    trace.push("media discovery collected twitter:image candidates");
  }
  if (rawSources.jsonLd.nodes.length > 0) {
    trace.push("media discovery scanned JSON-LD media");
  }
  if (rawSources.embeddedData.items.length > 0) {
    trace.push("media discovery scanned embedded application data");
  }
  if (rawSources.images.length > 0) {
    trace.push("media discovery scanned HTML images, srcset, lazy images, posters, and fallbacks");
  }
  if (externalResults.some((result) => (result.images?.length ?? 0) > 0 || (result.videos?.length ?? 0) > 0)) {
    trace.push("media discovery included adapter and plugin media");
  }

  return {
    images: dedupeMediaBySignature(uniqueMediaByUrl(images)),
    videos: dedupeMediaBySignature(uniqueMediaByUrl(videos)),
    audio: dedupeMediaBySignature(uniqueMediaByUrl(audio)),
    trace
  };
}

function normalizeAssets(assets: MediaAsset[], baseUrl: string): MediaAsset[] {
  return assets
    .map((asset) => {
      const secureUrl = tryResolveUrl(asset.secureUrl, baseUrl);
      const url = tryResolveUrl(secureUrl ?? asset.url, baseUrl);
      const poster = tryResolveUrl(asset.poster, baseUrl);

      if (!url || shouldIgnoreMediaUrl(url)) {
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

function jsonLdImages(nodes: JsonLdNode[]): MediaAsset[] {
  return nodes.flatMap((node) => [
    ...mediaFromJsonValue(node.image, "image", "jsonLd"),
    ...mediaFromJsonValue(node.thumbnailUrl, "image", "jsonLd"),
    ...mediaFromJsonValue(node.thumbnail, "image", "jsonLd"),
    ...mediaFromJsonValue(node.logo, "image", "jsonLd")
  ]);
}

function jsonLdVideos(nodes: JsonLdNode[]): MediaAsset[] {
  return nodes.flatMap((node) => [
    ...mediaFromJsonValue(node.contentUrl, "video", "jsonLd"),
    ...mediaFromJsonValue(node.embedUrl, "video", "jsonLd"),
    ...mediaFromJsonValue(node.video, "video", "jsonLd")
  ]);
}

function jsonLdAudio(nodes: JsonLdNode[]): MediaAsset[] {
  return nodes.flatMap((node) => [
    ...mediaFromJsonValue(node.contentUrl, "audio", "jsonLd"),
    ...mediaFromJsonValue(node.encoding, "audio", "jsonLd")
  ]);
}

function embeddedImages(items: EmbeddedDataItem[]): MediaAsset[] {
  return items.flatMap((item) => mediaFromEmbeddedItem(item, IMAGE_KEYS, "image"));
}

function embeddedVideos(items: EmbeddedDataItem[]): MediaAsset[] {
  return items.flatMap((item) => mediaFromEmbeddedItem(item, VIDEO_KEYS, "video"));
}

function embeddedAudio(items: EmbeddedDataItem[]): MediaAsset[] {
  return items.flatMap((item) => mediaFromEmbeddedItem(item, AUDIO_KEYS, "audio"));
}

function mediaFromEmbeddedItem(item: EmbeddedDataItem, keys: string[], kind: MediaAsset["kind"]): MediaAsset[] {
  const assets: MediaAsset[] = [];
  walkEmbeddedData(item.data, (value, key, parent) => {
    if (!key || !keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase())) {
      if (typeof value === "string" && looksLikeMediaUrl(value, kind) && key && keys.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase()))) {
        assets.push(assetFromEmbedded(value, kind, item, parent));
      }
      return;
    }

    assets.push(...mediaFromJsonValue(value, kind, item.source));
  });

  return assets;
}

function mediaFromJsonValue(value: unknown, kind: MediaAsset["kind"], source: string): MediaAsset[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return looksLikeMediaUrl(value, kind) ? [{ url: value, kind, source }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => mediaFromJsonValue(item, kind, source));
  }

  if (isRecord(value)) {
    const url = stringFromUnknown(value.url) ?? stringFromUnknown(value.src) ?? stringFromUnknown(value.contentUrl) ?? stringFromUnknown(value.thumbnailUrl);
    if (!url || !looksLikeMediaUrl(url, kind)) {
      return [];
    }

    return [
      {
        url,
        kind,
        source,
        width: parseNumber(stringFromUnknown(value.width)),
        height: parseNumber(stringFromUnknown(value.height)),
        alt: stringFromUnknown(value.alt) ?? stringFromUnknown(value.caption) ?? stringFromUnknown(value.name),
        title: stringFromUnknown(value.title),
        type: stringFromUnknown(value.type) ?? stringFromUnknown(value.mimeType) ?? stringFromUnknown(value.encodingFormat)
      }
    ];
  }

  return [];
}

function assetFromEmbedded(value: string, kind: MediaAsset["kind"], item: EmbeddedDataItem, parent: JsonLdNode | undefined): MediaAsset {
  return {
    url: value,
    kind,
    source: item.source,
    width: parseNumber(stringFromUnknown(parent?.width)),
    height: parseNumber(stringFromUnknown(parent?.height)),
    alt: stringFromUnknown(parent?.alt) ?? stringFromUnknown(parent?.caption),
    title: stringFromUnknown(parent?.title),
    metadata: {
      embeddedPath: item.path
    }
  };
}

function oEmbedImages(rawSources: RawMetadataSources): MediaAsset[] {
  return rawSources.oEmbed.data.flatMap((data) => {
    const images: MediaAsset[] = [];
    if (data.thumbnail_url) {
      images.push({
        url: data.thumbnail_url,
        kind: "image",
        source: "oEmbed",
        width: data.thumbnail_width,
        height: data.thumbnail_height
      });
    }

    if (data.type === "photo" && data.url) {
      images.push({
        url: data.url,
        kind: "image",
        source: "oEmbed",
        width: data.width,
        height: data.height
      });
    }

    return images;
  });
}

function dedupeMediaBySignature(assets: MediaAsset[]): MediaAsset[] {
  const seen = new Map<string, MediaAsset>();

  for (const asset of assets) {
    const key = mediaSignature(asset.url);
    const current = seen.get(key);
    if (!current || sourceRank(asset.source) > sourceRank(current.source)) {
      seen.set(key, asset);
    }
  }

  return [...seen.values()];
}

function mediaSignature(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname
      .replace(/[-_](?:\d{2,5}x\d{2,5}|\d{2,5}w|small|medium|large|thumb|thumbnail)(?=\.)/i, "")
      .toLowerCase();

    return `${parsed.hostname.toLowerCase()}${pathname}`;
  } catch {
    return url.toLowerCase();
  }
}

function sourceRank(source: string): number {
  const ranks: Record<string, number> = {
    adapter: 90,
    openGraph: 80,
    twitter: 75,
    jsonLd: 70,
    oEmbed: 65,
    nextData: 64,
    nuxt: 62,
    initialState: 61,
    preloadedState: 60,
    apollo: 59,
    applicationJson: 58,
    jsonScript: 55,
    html: 40,
    fallback: 30
  };

  return ranks[source] ?? 50;
}

function shouldIgnoreMediaUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return (
    normalized.startsWith("data:") ||
    normalized.startsWith("blob:") ||
    normalized.startsWith("javascript:") ||
    /(?:sprite|spacer|blank|transparent|placeholder|tracking|beacon|pixel|emoji)(?:[._/-]|$|\?)/i.test(normalized) ||
    /(?:^|[/?_-])1x1(?:[._/-]|$|\?)/i.test(normalized)
  );
}

function looksLikeMediaUrl(value: string, kind: MediaAsset["kind"]): boolean {
  if (shouldIgnoreMediaUrl(value)) {
    return false;
  }

  if (/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    if (kind === "image") {
      return /\.(?:avif|webp|png|jpe?g|gif)(?:[?#].*)?$/i.test(value) || /(?:image|thumb|thumbnail|cover|poster|preview|media|og|card|photo)/i.test(value);
    }

    if (kind === "video") {
      return /\.(?:mp4|webm|m3u8|mov)(?:[?#].*)?$/i.test(value) || /(?:video|embed|player|watch|reel|shorts)/i.test(value);
    }

    if (kind === "audio") {
      return /\.(?:mp3|m4a|wav|ogg|aac)(?:[?#].*)?$/i.test(value) || /(?:audio|podcast)/i.test(value);
    }
  }

  return false;
}

function walkEmbeddedData(value: unknown, visit: (value: unknown, key: string | undefined, parent: JsonLdNode | undefined) => void, key?: string, parent?: JsonLdNode, depth = 0): void {
  if (depth > 8) {
    return;
  }

  visit(value, key, parent);

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 250)) {
      walkEmbeddedData(item, visit, undefined, parent, depth + 1);
    }
    return;
  }

  if (isRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value).slice(0, 500)) {
      walkEmbeddedData(childValue, visit, childKey, value, depth + 1);
    }
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && (!Array.isArray(item) || item.length > 0))) as Partial<T>;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (isRecord(value)) {
    return stringFromUnknown(value.url) ?? stringFromUnknown(value.src) ?? stringFromUnknown(value.name);
  }

  return undefined;
}

function isRecord(value: unknown): value is JsonLdNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
