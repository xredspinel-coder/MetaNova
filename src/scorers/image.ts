import type { ImageScorer, MediaAsset } from "../types/index.js";
import { hasRedditImageContext, isRedditMediaUrl, redditImagePriority } from "../utils/redditMedia.js";

export interface ImageSelection {
  best?: MediaAsset;
  images: MediaAsset[];
  reason?: string;
}

const SOURCE_WEIGHT: Record<string, number> = {
  adapter: 98,
  openGraph: 94,
  oEmbed: 88,
  jsonLd: 82,
  twitter: 86,
  nextData: 76,
  nuxt: 74,
  initialState: 73,
  preloadedState: 73,
  apollo: 72,
  applicationJson: 70,
  jsonScript: 66,
  html: 42,
  fallback: 36,
  favicon: 8
};

export function scoreImages(images: MediaAsset[], customScorers: ImageScorer[] = []): MediaAsset[] {
  const duplicateCounts = countDuplicates(images);
  const redditContext = hasRedditImageContext(images);

  return images
    .map((image, index) => {
      const scored = scoreImageWithDetails(image, index, images, duplicateCounts);
      const customScore = customScorers.reduce((total, scorer) => total + scorer(image, { index, images }), 0);
      const score = clamp(scored.score + customScore, 0, 100);
      const reasons = customScore === 0 ? scored.reasons : [...scored.reasons, `custom scorers adjusted score by ${formatSigned(customScore)}`];

      return {
        ...image,
        score,
        confidence: Number((score / 100).toFixed(2)),
        metadata: {
          ...image.metadata,
          scoreReasons: reasons
        }
      };
    })
    .sort(
      (left, right) =>
        (redditContext ? redditImagePriority(right) - redditImagePriority(left) : 0) ||
        (right.score ?? 0) - (left.score ?? 0) ||
        sourceSortWeight(right) - sourceSortWeight(left) ||
        imageArea(right) - imageArea(left)
    );
}

export function selectBestImage(images: MediaAsset[], customScorers: ImageScorer[] = []): ImageSelection {
  const scored = scoreImages(images, customScorers);
  const best = scored[0];

  return {
    best,
    images: scored,
    reason: best ? explainImageChoice(best) : undefined
  };
}

function scoreImageWithDetails(image: MediaAsset, index: number, images: MediaAsset[], duplicateCounts: Map<string, number>): { score: number; reasons: string[] } {
  let score = SOURCE_WEIGHT[image.source] ?? 50;
  const reasons = [`source ${sourceLabel(image.source)} added ${score} base points`];
  const dimensions = scoreDimensions(image);
  const format = scoreFormat(image);
  const urlSignal = scoreUrlSignal(image);
  const redditMedia = scoreRedditMedia(image);
  const urlPenalty = scoreUrlPenalty(image);
  const duplicatePenalty = scoreDuplicatePenalty(image, duplicateCounts);

  score += dimensions.score;
  score += format.score;
  score += urlSignal.score;
  score += redditMedia.score;
  score -= urlPenalty;
  score -= duplicatePenalty.score;
  score -= Math.min(index * 1.5, 10);
  reasons.push(...dimensions.reasons, ...format.reasons, ...urlSignal.reasons, ...redditMedia.reasons, ...duplicatePenalty.reasons);

  if (images.length === 1) {
    score += 4;
    reasons.push("only candidate image added 4 points");
  }

  if (urlPenalty > 0) {
    reasons.push(`URL penalties subtracted ${urlPenalty} points`);
  }

  const positionPenalty = Math.min(index * 1.5, 10);
  if (positionPenalty > 0) {
    reasons.push(`candidate position subtracted ${formatNumber(positionPenalty)} points`);
  }

  return { score, reasons };
}

function scoreDimensions(image: MediaAsset): { score: number; reasons: string[] } {
  const width = image.width;
  const height = image.height;

  if (!width || !height) {
    return { score: 0, reasons: ["dimensions are unknown"] };
  }

  const area = width * height;
  const ratio = width / height;
  let score = 0;
  const reasons: string[] = [];

  if (width < 120 || height < 90) {
    score -= 35;
    reasons.push(`${width}x${height} is below preview minimum and subtracted 35 points`);
  } else if (area >= 1_000_000) {
    score += 12;
    reasons.push(`${width}x${height} dimensions added 12 points`);
  } else if (area >= 300_000) {
    score += 9;
    reasons.push(`${width}x${height} dimensions added 9 points`);
  } else if (area >= 90_000) {
    score += 5;
    reasons.push(`${width}x${height} dimensions added 5 points`);
  } else if (area < 10_000) {
    score -= 20;
    reasons.push(`${width}x${height} dimensions subtracted 20 points`);
  }

  if (isNear(ratio, 1.91, 0.18)) {
    score += 12;
    reasons.push(`aspect ratio ${ratio.toFixed(2)} matched social preview ratio`);
  } else if (isNear(ratio, 16 / 9, 0.2) || isNear(ratio, 1, 0.2)) {
    score += 8;
    reasons.push(`aspect ratio ${ratio.toFixed(2)} matched a common preview ratio`);
  } else if (ratio > 4 || ratio < 0.25) {
    score -= 16;
    reasons.push(`aspect ratio ${ratio.toFixed(2)} is unlikely to preview well`);
  }

  return { score, reasons };
}

function scoreFormat(image: MediaAsset): { score: number; reasons: string[] } {
  const type = image.type?.toLowerCase() ?? "";
  const url = image.url.toLowerCase();

  if (type.includes("webp") || url.endsWith(".webp")) {
    return { score: 4, reasons: ["modern WebP format added 4 points"] };
  }

  if (type.includes("avif") || /\.(avif)(\?|$)/.test(url)) {
    return { score: 4, reasons: ["modern AVIF format added 4 points"] };
  }

  if (type.includes("jpeg") || type.includes("jpg") || /\.(jpe?g)(\?|$)/.test(url)) {
    return { score: 3, reasons: ["JPEG format added 3 points"] };
  }

  if (type.includes("png") || /\.(png)(\?|$)/.test(url)) {
    return { score: 2, reasons: ["PNG format added 2 points"] };
  }

  if (/\.(gif|svg|ico)(\?|$)/.test(url)) {
    return { score: -8, reasons: ["GIF/SVG/ICO formats are weaker preview candidates"] };
  }

  return { score: 0, reasons: [] };
}

function scoreUrlSignal(image: MediaAsset): { score: number; reasons: string[] } {
  const url = image.url.toLowerCase();
  const matches = url.match(/cover|preview|thumbnail|thumb|og|card|media|hero|share|social|maxres|highres|large|original/g) ?? [];

  const platformScore = platformThumbnailScore(url);
  if (matches.length === 0 && platformScore.score === 0) {
    return { score: 0, reasons: [] };
  }

  const uniqueMatches = [...new Set(matches)];
  const score = Math.min(uniqueMatches.length * 4, 14) + platformScore.score;
  const reasons = uniqueMatches.length > 0 ? [`URL matched preview hints (${uniqueMatches.join(", ")}) and added ${Math.min(uniqueMatches.length * 4, 14)} points`] : [];
  reasons.push(...platformScore.reasons);

  return {
    score,
    reasons
  };
}

function platformThumbnailScore(url: string): { score: number; reasons: string[] } {
  if (/ytimg\.com\/vi\/[^/]+\/(?:maxresdefault|sddefault|hqdefault)/i.test(url)) {
    return { score: 12, reasons: ["YouTube platform thumbnail added 12 points"] };
  }

  if (/(?:i|preview|external-preview)\.redd\.it|v\.redd\.it/i.test(url)) {
    return { score: 10, reasons: ["Reddit media host added 10 points"] };
  }

  if (/pbs\.twimg\.com\/media|pinimg\.com|cdninstagram\.com|fbcdn\.net|tiktokcdn\.com|mir-s3-cdn-cf\.behance\.net/i.test(url)) {
    return { score: 8, reasons: ["social platform media host added 8 points"] };
  }

  return { score: 0, reasons: [] };
}

function scoreRedditMedia(image: MediaAsset): { score: number; reasons: string[] } {
  const priority = redditImagePriority(image);
  if (priority === 0 && !isRedditMediaUrl(image.url)) {
    return { score: 0, reasons: [] };
  }

  const url = image.url.toLowerCase();
  const mediaKind = typeof image.metadata?.redditMediaKind === "string" ? image.metadata.redditMediaKind : undefined;

  if (mediaKind === "gallery") {
    return { score: 24, reasons: ["Reddit gallery media added 24 points"] };
  }

  if (mediaKind === "previewOriginal") {
    return { score: 20, reasons: ["Reddit original preview media added 20 points"] };
  }

  if (/\/\/i\.redd\.it\//i.test(url)) {
    return { score: 18, reasons: ["Reddit direct image media added 18 points"] };
  }

  if (/\/\/preview\.redd\.it\//i.test(url)) {
    return { score: 16, reasons: ["Reddit preview media added 16 points"] };
  }

  if (/\/\/external-preview\.redd\.it\//i.test(url)) {
    return { score: -8, reasons: ["Reddit external preview media subtracted 8 points"] };
  }

  if (/\/\/thumbs\.redditmedia\.com\//i.test(url)) {
    return { score: -60, reasons: ["Reddit thumbnail host subtracted 60 points"] };
  }

  return { score: 0, reasons: [] };
}

function scoreUrlPenalty(image: MediaAsset): number {
  const url = image.url.toLowerCase();
  let penalty = 0;

  if (/favicon|apple-touch-icon|sprite|icon-|\/icon|placeholder|blank|spacer|pixel|tracking|emoji/.test(url)) {
    penalty += 30;
  }

  if (/logo|avatar|profile|headshot|badge/.test(url)) {
    penalty += 22;
  }

  if (image.alt && /logo|avatar|icon|emoji/i.test(image.alt)) {
    penalty += 14;
  }

  if (image.kind === "favicon") {
    penalty += 35;
  }

  return penalty;
}

function scoreDuplicatePenalty(image: MediaAsset, duplicateCounts: Map<string, number>): { score: number; reasons: string[] } {
  const count = duplicateCounts.get(mediaSignature(image.url)) ?? 0;
  if (count <= 1) {
    return { score: 0, reasons: [] };
  }

  const penalty = Math.min((count - 1) * 4, 12);
  return {
    score: penalty,
    reasons: [`duplicate-like URL group subtracted ${penalty} points`]
  };
}

function explainImageChoice(image: MediaAsset): string {
  const dimensions = image.width && image.height ? `${image.width}x${image.height}` : "unknown dimensions";
  const reasons = Array.isArray(image.metadata?.scoreReasons) ? image.metadata.scoreReasons.slice(0, 4).join("; ") : "";
  const reasonSuffix = reasons ? ` Reasons: ${reasons}.` : "";

  return `Selected because it came from ${sourceLabel(image.source)}, has ${dimensions}, and scored ${Math.round(image.score ?? 0)}.${reasonSuffix}`;
}

function isNear(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sourceLabel(source: string): string {
  if (source === "openGraph") {
    return "og:image";
  }

  if (source === "twitter") {
    return "Twitter Card metadata";
  }

  if (source === "jsonLd") {
    return "JSON-LD";
  }

  if (source === "oEmbed") {
    return "oEmbed";
  }

  if (["nextData", "nuxt", "initialState", "preloadedState", "apollo", "applicationJson", "jsonScript"].includes(source)) {
    return "embedded application data";
  }

  return source;
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function countDuplicates(images: MediaAsset[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const image of images) {
    const key = mediaSignature(image.url);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function imageArea(image: MediaAsset): number {
  return (image.width ?? 0) * (image.height ?? 0);
}

function sourceSortWeight(image: MediaAsset): number {
  return SOURCE_WEIGHT[image.source] ?? 50;
}

function mediaSignature(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname
      .replace(/[-_](?:\d{2,5}x\d{2,5}|\d{2,5}w|small|medium|large|thumb|thumbnail)(?=\.)/i, "")
      .toLowerCase()}`;
  } catch {
    return url.toLowerCase();
  }
}
