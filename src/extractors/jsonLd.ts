import type { JsonLdMetadata, JsonLdNode } from "../types/index.js";
import { loadDocument, normalizeWhitespace } from "../utils/html.js";

export function extractJsonLd(html: string): JsonLdMetadata {
  const $ = loadDocument(html);
  const nodes: JsonLdNode[] = [];
  const warnings: string[] = [];

  $("script[type*='ld+json']").each((index, element) => {
    const source = normalizeWhitespace($(element).text()) ?? normalizeWhitespace($(element).html());
    if (!source) {
      return;
    }

    try {
      for (const node of flattenJsonLd(JSON.parse(cleanJson(source)))) {
        nodes.push(node);
      }
    } catch (error) {
      warnings.push(`Could not parse JSON-LD script at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  return { nodes, warnings };
}

function cleanJson(source: string): string {
  return source
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .trim();
}

function flattenJsonLd(value: unknown): JsonLdNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item));
  }

  if (!isRecord(value)) {
    return [];
  }

  const graph = value["@graph"];
  const current = value as JsonLdNode;
  if (Array.isArray(graph)) {
    return [current, ...graph.filter(isRecord)];
  }

  return [current];
}

function isRecord(value: unknown): value is JsonLdNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
