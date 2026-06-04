import type { AdapterContext, AdapterExtractionResult, PluginExtractionResult, RawMetadataSources, SiteAdapter, UnifiedMetadata } from "./types/index.js";
import { extractAudio, extractEmbeddedData, extractHtmlMetadata, extractImages, extractJsonLd, extractOEmbed, extractOpenGraph, extractTwitterCards, extractVideos, fetchOEmbedData } from "./extractors/index.js";
import { normalizeMetadata } from "./normalizers/index.js";
import { createRegistry } from "./plugins/index.js";
import { createEmptyDiagnostics, loadDocument } from "./utils/html.js";
import { resolveUrl } from "./utils/url.js";
import type { FetchMetadataOptions, ParseMetadataOptions } from "./types/index.js";

export function parseMetadata(html: string, url: string, options: ParseMetadataOptions = {}): UnifiedMetadata {
  const finalUrl = resolveUrl(url);
  const registry = createRegistry(options);
  const diagnostics = createEmptyDiagnostics();
  diagnostics.originalUrl = url;
  diagnostics.finalUrl = finalUrl;
  diagnostics.trace.push("validated and normalized URL");
  const rawSources: RawMetadataSources = {
    html: extractHtmlMetadata(html),
    openGraph: extractOpenGraph(html),
    twitter: extractTwitterCards(html),
    jsonLd: extractJsonLd(html),
    embeddedData: extractEmbeddedData(html),
    oEmbed: extractOEmbed(html, finalUrl),
    images: extractImages(html, finalUrl),
    videos: extractVideos(html, finalUrl),
    audio: extractAudio(html, finalUrl),
    adapters: [],
    plugins: []
  };
  appendExtractionTrace(rawSources, diagnostics.trace);

  const $ = loadDocument(html);
  const fetchOptions = options as FetchMetadataOptions;

  if (fetchOptions.fetchOEmbed && rawSources.oEmbed.links.length > 0) {
    diagnostics.warnings.push("parseMetadata is synchronous; oEmbed endpoints are discovered but not fetched. Use fetchMetadata or parseMetadataAsync.");
  }

  for (const extractor of registry.extractors) {
    try {
      const result = extractor.extract({ html, url, finalUrl, $, raw: rawSources, options });
      if (isPromise(result)) {
        diagnostics.warnings.push(`Plugin extractor "${extractor.name}" returned a Promise during parseMetadata; use fetchMetadata or pre-resolve async work.`);
        continue;
      }

      rawSources.plugins.push(withSource(result, extractor.name));
      diagnostics.trace.push(`plugin extractor matched: ${extractor.name}`);
    } catch (error) {
      diagnostics.warnings.push(`Plugin extractor "${extractor.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const parsedUrl = new URL(finalUrl);
  for (const adapter of registry.adapters) {
    if (!adapterMatches(adapter, parsedUrl)) {
      continue;
    }

    try {
      const context: AdapterContext = { html, url, finalUrl, $, raw: rawSources, options };
      const result = adapter.extract(context);
      if (isPromise(result)) {
        diagnostics.warnings.push(`Adapter "${adapter.name}" returned a Promise during parseMetadata; use fetchMetadata or a synchronous adapter.`);
        continue;
      }

      const normalized = adapter.normalize?.(result as AdapterExtractionResult, context);
      if (normalized && isPromise(normalized)) {
        diagnostics.warnings.push(`Adapter "${adapter.name}" normalize returned a Promise during parseMetadata; use fetchMetadata or a synchronous adapter.`);
        continue;
      }

      rawSources.adapters.push(withSource(normalized ?? (result as AdapterExtractionResult), adapter.name));
      diagnostics.trace.push(`adapter matched: ${adapter.name}`);
    } catch (error) {
      diagnostics.warnings.push(`Adapter "${adapter.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return normalizeMetadata(rawSources, {
    url,
    finalUrl,
    diagnostics,
    imageScorers: registry.imageScorers,
    includeRaw: options.includeRaw
  });
}

export async function parseMetadataAsync(html: string, url: string, options: ParseMetadataOptions = {}): Promise<UnifiedMetadata> {
  const finalUrl = resolveUrl(url);
  const registry = createRegistry(options);
  const diagnostics = createEmptyDiagnostics();
  diagnostics.originalUrl = url;
  diagnostics.finalUrl = finalUrl;
  diagnostics.trace.push("validated and normalized URL");
  const rawSources: RawMetadataSources = {
    html: extractHtmlMetadata(html),
    openGraph: extractOpenGraph(html),
    twitter: extractTwitterCards(html),
    jsonLd: extractJsonLd(html),
    embeddedData: extractEmbeddedData(html),
    oEmbed: extractOEmbed(html, finalUrl),
    images: extractImages(html, finalUrl),
    videos: extractVideos(html, finalUrl),
    audio: extractAudio(html, finalUrl),
    adapters: [],
    plugins: []
  };
  appendExtractionTrace(rawSources, diagnostics.trace);
  const $ = loadDocument(html);
  const fetchOptions = options as FetchMetadataOptions;

  if (fetchOptions.fetchOEmbed && rawSources.oEmbed.links.length > 0) {
    const oEmbed = await fetchOEmbedData(rawSources.oEmbed.links, fetchOptions);
    rawSources.oEmbed.data = oEmbed.data;
    diagnostics.warnings.push(...oEmbed.warnings);
    diagnostics.trace.push("fetched discovered oEmbed JSON endpoints");
  }

  for (const extractor of registry.extractors) {
    try {
      rawSources.plugins.push(withSource(await extractor.extract({ html, url, finalUrl, $, raw: rawSources, options }), extractor.name));
      diagnostics.trace.push(`plugin extractor matched: ${extractor.name}`);
    } catch (error) {
      diagnostics.warnings.push(`Plugin extractor "${extractor.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const parsedUrl = new URL(finalUrl);
  for (const adapter of registry.adapters) {
    if (!adapterMatches(adapter, parsedUrl)) {
      continue;
    }

    try {
      const context: AdapterContext = { html, url, finalUrl, $, raw: rawSources, options };
      const result = await adapter.extract(context);
      const normalized = adapter.normalize ? await adapter.normalize(result as AdapterExtractionResult, context) : (result as AdapterExtractionResult);
      rawSources.adapters.push(withSource(normalized, adapter.name));
      diagnostics.trace.push(`adapter matched: ${adapter.name}`);
    } catch (error) {
      diagnostics.warnings.push(`Adapter "${adapter.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return normalizeMetadata(rawSources, {
    url,
    finalUrl,
    diagnostics,
    imageScorers: registry.imageScorers,
    includeRaw: options.includeRaw
  });
}

function withSource<T extends AdapterExtractionResult | PluginExtractionResult>(result: T, source: string): T {
  return {
    ...result,
    source: result.source || source
  };
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === "function");
}

function adapterMatches(adapter: SiteAdapter, url: URL): boolean {
  return adapter.detect?.(url) ?? adapter.canHandle?.(url) ?? false;
}

function appendExtractionTrace(rawSources: RawMetadataSources, trace: string[]): void {
  if (Object.keys(rawSources.openGraph.raw).length > 0) {
    trace.push("parsed Open Graph");
  }
  if (Object.keys(rawSources.twitter.raw).length > 0) {
    trace.push("parsed Twitter Cards");
  }
  if (rawSources.jsonLd.nodes.length > 0) {
    trace.push("parsed JSON-LD");
  }
  if (rawSources.embeddedData.items.length > 0) {
    trace.push("parsed embedded application data");
  }
  if (rawSources.oEmbed.links.length > 0) {
    trace.push("discovered oEmbed endpoints");
  }
  if (rawSources.images.length > 0 || rawSources.videos.length > 0 || rawSources.audio.length > 0) {
    trace.push("discovered HTML media candidates");
  }
}
