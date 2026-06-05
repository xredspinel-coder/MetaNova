import type { MediaAsset } from "../types/index.js";

const REDDIT_BAD_IMAGE_URL_PATTERN = /thumbs\.redditmedia\.com|avatar|community_icon|subreddit|icon|award|emoji/i;

const TRUSTED_REDDIT_SOURCES = new Set([
  "adapter",
  "openGraph",
  "twitter",
  "jsonLd",
  "oEmbed",
  "nextData",
  "nuxt",
  "initialState",
  "preloadedState",
  "apollo",
  "applicationJson",
  "jsonScript"
]);

export function isRedditUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return host === "reddit.com" || host === "redd.it" || host.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

export function filterRedditImageCandidates(images: MediaAsset[]): MediaAsset[] {
  const allowed = images.filter(isAllowedRedditImageCandidate);
  const trusted = allowed.filter(isTrustedRedditImageCandidate);
  return prioritizeRedditImages(trusted.length > 0 ? trusted : allowed);
}

export function prioritizeRedditImages(images: MediaAsset[]): MediaAsset[] {
  return images.slice().sort(
    (left, right) =>
      redditImagePriority(right) - redditImagePriority(left) ||
      imageArea(right) - imageArea(left)
  );
}

export function isAllowedRedditImageCandidate(image: MediaAsset): boolean {
  if (image.width !== undefined && image.width < 200) {
    return false;
  }

  if (image.height !== undefined && image.height < 200) {
    return false;
  }

  return !REDDIT_BAD_IMAGE_URL_PATTERN.test(image.url);
}

export function redditImagePriority(image: MediaAsset): number {
  const mediaKind = typeof image.metadata?.redditMediaKind === "string" ? image.metadata.redditMediaKind : undefined;
  const url = image.url.toLowerCase();

  if (mediaKind === "gallery") {
    return 700;
  }

  if (mediaKind === "previewOriginal") {
    return 620;
  }

  if (mediaKind === "directImage") {
    return 580;
  }

  if (/\/\/preview\.redd\.it\//i.test(url)) {
    return 560;
  }

  if (/\/\/i\.redd\.it\//i.test(url)) {
    return 540;
  }

  if (image.source === "openGraph" || image.source === "twitter") {
    return 420;
  }

  if (/\/\/external-preview\.redd\.it\//i.test(url)) {
    return 300;
  }

  if (/\/\/thumbs\.redditmedia\.com\//i.test(url)) {
    return 1;
  }

  return isRedditMediaUrl(url) ? 250 : 0;
}

export function hasRedditImageContext(images: MediaAsset[]): boolean {
  return images.some((image) => {
    const adapter = typeof image.metadata?.adapter === "string" ? image.metadata.adapter : "";
    const originalSource = typeof image.metadata?.originalSource === "string" ? image.metadata.originalSource : "";
    return adapter === "redditAdapter" || originalSource === "redditJsonEndpoint" || Boolean(image.metadata?.redditMediaKind);
  });
}

export function isRedditMediaUrl(value: string): boolean {
  return /(?:^https?:)?\/\/(?:(?:i|preview|external-preview)\.redd\.it|thumbs\.redditmedia\.com|v\.redd\.it)\//i.test(value);
}

function isTrustedRedditImageCandidate(image: MediaAsset): boolean {
  return TRUSTED_REDDIT_SOURCES.has(image.source) || Boolean(image.metadata?.redditMediaKind);
}

function imageArea(image: MediaAsset): number {
  return (image.width ?? 0) * (image.height ?? 0);
}
