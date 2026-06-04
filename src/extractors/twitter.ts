import type { CheerioAPI } from "cheerio";
import type { MediaAsset, TwitterMetadata } from "../types/index.js";
import { loadDocument, normalizeWhitespace, parseInteger, setMapValue } from "../utils/html.js";

export function extractTwitterCards(html: string): TwitterMetadata {
  const $ = loadDocument(html);
  const raw: Record<string, string | string[]> = {};

  $("meta[name], meta[property]").each((_, element) => {
    const key = readMetaKey($, element);
    const content = normalizeWhitespace($(element).attr("content"));

    if (!key?.startsWith("twitter:") || !content) {
      return;
    }

    setMapValue(raw, key, content);
  });

  return {
    card: firstRaw(raw, "twitter:card"),
    site: firstRaw(raw, "twitter:site"),
    creator: firstRaw(raw, "twitter:creator"),
    title: firstRaw(raw, "twitter:title"),
    description: firstRaw(raw, "twitter:description"),
    images: collectImages(raw),
    videos: collectVideos(raw),
    raw
  };
}

function collectImages(raw: Record<string, string | string[]>): MediaAsset[] {
  const urls = uniqueStrings([
    ...allRaw(raw, "twitter:image"),
    ...allRaw(raw, "twitter:image:src"),
    ...allRaw(raw, "twitter:images"),
    ...allRaw(raw, "twitter:image0"),
    ...allRaw(raw, "twitter:image1"),
    ...allRaw(raw, "twitter:image2"),
    ...allRaw(raw, "twitter:image3"),
    ...allRaw(raw, "twitter:player:image"),
    ...Object.entries(raw)
      .filter(([key]) => /^twitter:image(?::\d+)?$/i.test(key) || /^twitter:image:\d+$/i.test(key))
      .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
  ]);
  const alt = firstRaw(raw, "twitter:image:alt");
  const width = parseInteger(firstRaw(raw, "twitter:image:width"));
  const height = parseInteger(firstRaw(raw, "twitter:image:height"));

  return urls.map((url) => ({
    url,
    kind: "image",
    source: "twitter",
    alt,
    width,
    height
  }));
}

function collectVideos(raw: Record<string, string | string[]>): MediaAsset[] {
  const players = allRaw(raw, "twitter:player") ?? allRaw(raw, "twitter:player:stream") ?? [];
  const width = parseInteger(firstRaw(raw, "twitter:player:width"));
  const height = parseInteger(firstRaw(raw, "twitter:player:height"));

  return players.map((url) => ({
    url,
    kind: "video",
    source: "twitter",
    width,
    height
  }));
}

function readMetaKey($: CheerioAPI, element: any): string | undefined {
  return normalizeWhitespace($(element).attr("name")) ?? normalizeWhitespace($(element).attr("property"));
}

function firstRaw(raw: Record<string, string | string[]>, key: string): string | undefined {
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

function allRaw(raw: Record<string, string | string[]>, key: string): string[] {
  const value = raw[key];
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
