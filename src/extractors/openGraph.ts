import type { CheerioAPI } from "cheerio";
import type { MediaAsset, OpenGraphMetadata } from "../types/index.js";
import { loadDocument, normalizeWhitespace, parseInteger, setMapValue } from "../utils/html.js";

export function extractOpenGraph(html: string): OpenGraphMetadata {
  const $ = loadDocument(html);
  const raw: Record<string, string | string[]> = {};

  $("meta[property], meta[name]").each((_, element) => {
    const key = readMetaKey($, element);
    const content = normalizeWhitespace($(element).attr("content"));

    if (!key || !content || (!key.startsWith("og:") && !key.startsWith("article:") && !key.startsWith("product:"))) {
      return;
    }

    setMapValue(raw, key, content);
  });

  return {
    title: firstRaw(raw, "og:title"),
    description: firstRaw(raw, "og:description"),
    type: firstRaw(raw, "og:type"),
    url: firstRaw(raw, "og:url"),
    siteName: firstRaw(raw, "og:site_name"),
    locale: firstRaw(raw, "og:locale"),
    determiner: firstRaw(raw, "og:determiner"),
    images: collectStructuredMedia($, "image"),
    videos: collectStructuredMedia($, "video"),
    audio: collectStructuredMedia($, "audio"),
    article: {
      publishedTime: firstRaw(raw, "article:published_time"),
      modifiedTime: firstRaw(raw, "article:modified_time"),
      expirationTime: firstRaw(raw, "article:expiration_time"),
      section: firstRaw(raw, "article:section"),
      tags: allRaw(raw, "article:tag"),
      authors: allRaw(raw, "article:author")?.map((name) => ({ name }))
    },
    product: {
      price: firstRaw(raw, "product:price:amount"),
      currency: firstRaw(raw, "product:price:currency"),
      availability: firstRaw(raw, "product:availability"),
      condition: firstRaw(raw, "product:condition")
    },
    raw
  };
}

function collectStructuredMedia($: CheerioAPI, kind: "image" | "video" | "audio"): MediaAsset[] {
  const assets: MediaAsset[] = [];
  const prefix = `og:${kind}`;

  $("meta[property], meta[name]").each((_, element) => {
    const key = readMetaKey($, element);
    const content = normalizeWhitespace($(element).attr("content"));

    if (!key?.startsWith(prefix) || !content) {
      return;
    }

    const current = assets.at(-1);

    if (key === prefix || key === `${prefix}:url`) {
      if (key.endsWith(":url") && current && !current.url) {
        current.url = content;
        return;
      }

      assets.push({
        url: content,
        kind,
        source: "openGraph"
      });
      return;
    }

    const target = current ?? pushEmptyAsset(assets, kind);
    const property = key.slice(prefix.length + 1);

    if (property === "secure_url") {
      target.secureUrl = content;
    } else if (property === "type") {
      target.type = content;
    } else if (property === "width") {
      target.width = parseInteger(content);
    } else if (property === "height") {
      target.height = parseInteger(content);
    } else if (property === "alt") {
      target.alt = content;
    }
  });

  return assets.filter((asset) => Boolean(asset.url));
}

function pushEmptyAsset(assets: MediaAsset[], kind: "image" | "video" | "audio"): MediaAsset {
  const asset: MediaAsset = {
    url: "",
    kind,
    source: "openGraph"
  };
  assets.push(asset);
  return asset;
}

function readMetaKey($: CheerioAPI, element: any): string | undefined {
  return normalizeWhitespace($(element).attr("property")) ?? normalizeWhitespace($(element).attr("name"));
}

function firstRaw(raw: Record<string, string | string[]>, key: string): string | undefined {
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

function allRaw(raw: Record<string, string | string[]>, key: string): string[] | undefined {
  const value = raw[key];
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value : [value];
}
