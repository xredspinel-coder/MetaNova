import { load, type CheerioAPI } from "cheerio";
import type { ExtractionDiagnostics, MediaAsset } from "../types/index.js";

export function loadDocument(html: string): CheerioAPI {
  return load(html);
}

export function normalizeWhitespace(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function firstDefined<T>(...values: Array<T | undefined | null | false | "">): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== false && value !== "") {
      return value as T;
    }
  }

  return undefined;
}

export function parseInteger(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseNumber(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readMetaContent($: CheerioAPI, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const content = normalizeWhitespace($(selector).first().attr("content"));
    if (content) {
      return content;
    }
  }

  return undefined;
}

export function setMapValue(map: Record<string, string | string[]>, key: string, value: string): void {
  const current = map[key];
  if (Array.isArray(current)) {
    current.push(value);
    return;
  }

  if (typeof current === "string") {
    map[key] = [current, value];
    return;
  }

  map[key] = value;
}

export function splitList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const items = value
    .split(",")
    .map((item) => normalizeWhitespace(item))
    .filter((item): item is string => Boolean(item));

  return items.length > 0 ? items : undefined;
}

export function parseSrcset(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export function uniqueMediaByUrl(assets: MediaAsset[]): MediaAsset[] {
  const seen = new Set<string>();
  const unique: MediaAsset[] = [];

  for (const asset of assets) {
    const key = asset.url;
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(asset);
  }

  return unique;
}

export function createEmptyDiagnostics(): ExtractionDiagnostics {
  return {
    redirects: [],
    sourcesUsed: [],
    warnings: [],
    trace: [],
    extractedAt: new Date().toISOString()
  };
}
