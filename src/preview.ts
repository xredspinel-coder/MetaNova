import type { PreviewCard, UnifiedMetadata } from "./types/index.js";

export function createPreviewCard(metadata: UnifiedMetadata): PreviewCard {
  return {
    title: metadata.title,
    description: metadata.description,
    image: metadata.bestImage,
    url: metadata.canonicalUrl ?? metadata.finalUrl,
    siteName: metadata.siteName,
    domain: domainFromUrl(metadata.canonicalUrl ?? metadata.finalUrl),
    author: metadata.author?.name,
    type: metadata.type,
    confidence: metadata.confidence
  };
}

function domainFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
