import type { FetchMetadataOptions, OEmbedData, OEmbedLink, OEmbedMetadata } from "../types/index.js";
import { fetchPage } from "../fetcher/index.js";
import { loadDocument, normalizeWhitespace } from "../utils/html.js";
import { tryResolveUrl } from "../utils/url.js";

export function extractOEmbed(html: string, url: string): OEmbedMetadata {
  const $ = loadDocument(html);
  const links: OEmbedMetadata["links"] = [];

  $("link[rel][href]").each((_, element) => {
    const rel = normalizeWhitespace($(element).attr("rel"))?.toLowerCase() ?? "";
    const relTokens = rel.split(/\s+/);
    const type = normalizeWhitespace($(element).attr("type"));
    const title = normalizeWhitespace($(element).attr("title"));
    const hrefValue = normalizeWhitespace($(element).attr("href"));
    const looksLikeOEmbed = /oembed/i.test(type ?? "") || /oembed/i.test(title ?? "") || /[?&]format=(?:json|xml)/i.test(hrefValue ?? "");

    if (!relTokens.includes("alternate") && !relTokens.includes("alternate-oembed") && !looksLikeOEmbed) {
      return;
    }

    if (!looksLikeOEmbed) {
      return;
    }

    const href = tryResolveUrl(hrefValue, url);
    if (!href) {
      return;
    }

    links.push({
      href,
      type,
      title
    });
  });

  return {
    links,
    data: []
  };
}

export async function fetchOEmbedData(
  links: OEmbedLink[],
  options: FetchMetadataOptions = {}
): Promise<{ data: OEmbedData[]; warnings: string[] }> {
  const data: OEmbedData[] = [];
  const warnings: string[] = [];

  await Promise.all(
    links.map(async (link) => {
      if (link.type && !/json/i.test(link.type)) {
        warnings.push(`Skipping non-JSON oEmbed endpoint: ${link.href}.`);
        return;
      }

      try {
        const page = await fetchPage(link.href, {
          ...options,
          headers: {
            "accept": "application/json,*/*;q=0.8",
            ...headersToObject(options.headers)
          }
        });
        data.push(JSON.parse(page.html) as OEmbedData);
      } catch (error) {
        warnings.push(`Could not fetch oEmbed endpoint ${link.href}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  return { data, warnings };
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(new Headers(headers).entries());
}
