import type { HtmlMetadata, MediaAsset } from "../types/index.js";
import { loadDocument, normalizeWhitespace, readMetaContent, splitList } from "../utils/html.js";

export function extractHtmlMetadata(html: string): HtmlMetadata {
  const $ = loadDocument(html);
  const favicons: MediaAsset[] = [];
  const alternates: HtmlMetadata["alternates"] = [];
  let canonicalUrl: string | undefined;
  let imageSrc: MediaAsset | undefined;

  $("link[rel][href]").each((_, element) => {
    const rel = normalizeWhitespace($(element).attr("rel"))?.toLowerCase();
    const href = normalizeWhitespace($(element).attr("href"));
    const type = normalizeWhitespace($(element).attr("type"));

    if (!rel || !href) {
      return;
    }

    const relTokens = rel.split(/\s+/);
    if (relTokens.includes("canonical")) {
      canonicalUrl = href;
    }

    if (relTokens.includes("image_src")) {
      imageSrc = {
        url: href,
        kind: "image",
        source: "html"
      };
    }

    if (relTokens.includes("alternate")) {
      alternates.push({
        href,
        type,
        hreflang: normalizeWhitespace($(element).attr("hreflang")),
        title: normalizeWhitespace($(element).attr("title"))
      });
    }

    if (
      relTokens.includes("icon") ||
      relTokens.includes("shortcut") ||
      relTokens.includes("apple-touch-icon") ||
      relTokens.includes("mask-icon")
    ) {
      favicons.push({
        url: href,
        kind: "favicon",
        source: "favicon",
        type,
        metadata: {
          sizes: normalizeWhitespace($(element).attr("sizes")),
          rel
        }
      });
    }
  });

  return {
    title: normalizeWhitespace($("title").first().text()) ?? readMetaContent($, ["meta[name='title']"]),
    description: readMetaContent($, ["meta[name='description']", "meta[itemprop='description']"]),
    keywords: splitList(readMetaContent($, ["meta[name='keywords']"])),
    robots: readMetaContent($, ["meta[name='robots']"]),
    canonicalUrl,
    manifestUrl: normalizeWhitespace($("link[rel='manifest']").first().attr("href")),
    themeColor: readMetaContent($, ["meta[name='theme-color']"]),
    applicationName: readMetaContent($, ["meta[name='application-name']", "meta[name='apple-mobile-web-app-title']"]),
    favicons,
    imageSrc,
    alternates
  };
}
