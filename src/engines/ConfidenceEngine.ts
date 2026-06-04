import type { AdapterExtractionResult, Entity, MediaAsset, RawMetadataSources } from "../types/index.js";

export interface ConfidenceEngineInput {
  title?: string;
  description?: string;
  bestImage?: MediaAsset;
  canonicalUrl?: string;
  author?: Entity;
  hasStructuredData: boolean;
  rawSources: RawMetadataSources;
  sourcesUsed: string[];
  warnings: string[];
}

export interface CompletenessInput {
  title?: string;
  description?: string;
  bestImage?: MediaAsset;
  canonicalUrl?: string;
  siteName?: string;
  author?: Entity;
  publisher?: Entity;
  type?: string;
  publishedTime?: string;
  mediaCount: number;
}

export interface ReliabilityInput {
  confidence: number;
  completeness: number;
  adapterMatched: boolean;
  bestImage?: MediaAsset;
  warnings: string[];
}

export function calculateConfidence(input: ConfidenceEngineInput): number {
  let score = 0;

  score += qualityPoints(input.title, 18, 6, 120);
  score += qualityPoints(input.description, 16, 24, 300);

  if (input.bestImage) {
    score += 18;
    score += Math.min(input.bestImage.score ?? 0, 100) * 0.12;
    score += sourceConfidenceBonus(input.bestImage.source);
  }

  if (input.canonicalUrl) {
    score += 10;
  }

  if (input.hasStructuredData) {
    score += 12;
  }

  if (adapterSucceeded(input.rawSources.adapters)) {
    score += 8;
  }

  if (input.sourcesUsed.includes("openGraph")) {
    score += 6;
  }

  if (input.sourcesUsed.includes("twitter")) {
    score += 4;
  }

  if (input.rawSources.embeddedData.items.length > 0) {
    score += 6;
  }

  score -= Math.min(input.warnings.length * 3, 18);

  return Math.round(clamp(score, 0, 100));
}

export function calculateCompleteness(input: CompletenessInput): number {
  const weights = [
    input.title ? 20 : 0,
    input.description ? 16 : 0,
    input.bestImage ? 20 : 0,
    input.canonicalUrl ? 12 : 0,
    input.siteName ? 8 : 0,
    input.author ? 8 : 0,
    input.publisher ? 5 : 0,
    input.type && input.type !== "unknown" ? 6 : 0,
    input.publishedTime ? 3 : 0,
    input.mediaCount > 1 ? 2 : 0
  ];

  return Math.round(clamp(weights.reduce((total, value) => total + value, 0), 0, 100));
}

export function calculateReliability(input: ReliabilityInput): number {
  let score = input.confidence * 0.45 + input.completeness * 0.3;

  if (input.adapterMatched) {
    score += 10;
  }

  if ((input.bestImage?.score ?? 0) >= 80) {
    score += 10;
  } else if (input.bestImage) {
    score += 5;
  }

  score -= Math.min(input.warnings.length * 4, 20);

  return Math.round(clamp(score, 0, 100));
}

function qualityPoints(value: string | undefined, maxPoints: number, idealMinLength: number, idealMaxLength: number): number {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return 0;
  }

  let points = maxPoints;

  if (normalized.length < idealMinLength) {
    points *= normalized.length / idealMinLength;
  }

  if (normalized.length > idealMaxLength) {
    points *= Math.max(0.4, idealMaxLength / normalized.length);
  }

  if (/^(home|untitled|index|login|sign in)$/i.test(normalized)) {
    points *= 0.35;
  }

  return points;
}

function sourceConfidenceBonus(source: string): number {
  if (source === "adapter") {
    return 8;
  }

  if (source === "openGraph" || source === "twitter") {
    return 7;
  }

  if (source === "jsonLd" || source === "oEmbed") {
    return 6;
  }

  if (["nextData", "nuxt", "initialState", "preloadedState", "apollo", "applicationJson"].includes(source)) {
    return 5;
  }

  if (source === "html") {
    return 3;
  }

  return 1;
}

function adapterSucceeded(adapters: AdapterExtractionResult[]): boolean {
  return adapters.some((adapter) => Boolean(adapter.title || adapter.description || adapter.images?.length || adapter.videos?.length));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
