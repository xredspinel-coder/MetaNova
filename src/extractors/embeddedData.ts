import type { EmbeddedDataItem, EmbeddedDataMetadata, JsonLdNode } from "../types/index.js";
import { loadDocument, normalizeWhitespace } from "../utils/html.js";

const MAX_SCRIPT_CHARS = 1_500_000;

const ASSIGNMENT_PATTERNS: Array<{ source: EmbeddedDataItem["source"]; names: string[] }> = [
  { source: "nuxt", names: ["window.__NUXT__", "__NUXT__"] },
  { source: "initialState", names: ["window.__INITIAL_STATE__", "__INITIAL_STATE__"] },
  { source: "preloadedState", names: ["window.__PRELOADED_STATE__", "__PRELOADED_STATE__"] },
  { source: "apollo", names: ["window.__APOLLO_STATE__", "__APOLLO_STATE__", "window.__APOLLO_CLIENT__"] },
  { source: "youtubeInitialData", names: ["ytInitialData", "window.ytInitialData"] },
  { source: "youtubePlayerResponse", names: ["ytInitialPlayerResponse", "window.ytInitialPlayerResponse"] }
];

export function extractEmbeddedData(html: string): EmbeddedDataMetadata {
  const $ = loadDocument(html);
  const items: EmbeddedDataItem[] = [];
  const warnings: string[] = [];

  const nextData = parseJsonScript($("#__NEXT_DATA__").first().html() ?? $("#__NEXT_DATA__").first().text(), "nextData", warnings);
  if (nextData) {
    items.push(nextData);
  }

  const nuxtData = parseJsonScript($("#__NUXT_DATA__").first().html() ?? $("#__NUXT_DATA__").first().text(), "nuxt", warnings);
  if (nuxtData) {
    items.push(nuxtData);
  }

  $("script").each((index, element) => {
    const type = normalizeWhitespace($(element).attr("type"))?.toLowerCase();
    const id = normalizeWhitespace($(element).attr("id"));
    const source = $(element).html() ?? $(element).text();

    if (!source || source.length > MAX_SCRIPT_CHARS) {
      return;
    }

    if (type?.includes("application/json") || type?.includes("application/ld+json")) {
      const parsed = parseJsonScript(source, type?.includes("ld+json") ? "jsonScript" : "applicationJson", warnings, id);
      if (parsed) {
        items.push(parsed);
      }
    }

    for (const pattern of ASSIGNMENT_PATTERNS) {
      for (const name of pattern.names) {
        const data = parseAssignedJson(source, name);
        if (data) {
          items.push({
            source: pattern.source,
            path: name,
            data
          });
        }
      }
    }

    const apolloLike = findApolloPayload(source);
    if (apolloLike) {
      items.push({
        source: "apollo",
        path: `script[${index}]`,
        data: apolloLike
      });
    }
  });

  return {
    items: dedupeEmbeddedItems(items),
    warnings
  };
}

function parseJsonScript(
  source: string | null | undefined,
  itemSource: EmbeddedDataItem["source"],
  warnings: string[],
  path?: string
): EmbeddedDataItem | undefined {
  const cleanSource = cleanJsonSource(source);
  if (!cleanSource) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(cleanSource);
    if (!isRecord(parsed)) {
      return undefined;
    }

    return {
      source: itemSource,
      path,
      data: parsed
    };
  } catch (error) {
    warnings.push(`Could not parse ${itemSource} embedded JSON${path ? ` at ${path}` : ""}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function parseAssignedJson(source: string, assignmentName: string): JsonLdNode | undefined {
  const index = source.indexOf(assignmentName);
  if (index === -1) {
    return undefined;
  }

  const afterName = source.slice(index + assignmentName.length);
  const assignmentIndex = afterName.search(/=\s*[[{]/);
  if (assignmentIndex === -1) {
    return undefined;
  }

  const startInAfterName = afterName.slice(assignmentIndex).search(/[[{]/);
  if (startInAfterName === -1) {
    return undefined;
  }

  const start = index + assignmentName.length + assignmentIndex + startInAfterName;
  const candidate = readBalancedJson(source, start);
  if (!candidate) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(candidate);
    return isRecord(parsed) ? parsed : { value: parsed };
  } catch {
    return undefined;
  }
}

function findApolloPayload(source: string): JsonLdNode | undefined {
  if (!/apollo|__APOLLO/i.test(source)) {
    return undefined;
  }

  const data = parseAssignedJson(source, "window.__APOLLO_STATE__") ?? parseAssignedJson(source, "__APOLLO_STATE__");
  if (data) {
    return data;
  }

  return undefined;
}

function readBalancedJson(source: string, start: number): string | undefined {
  const opener = source[start];
  const closer = opener === "{" ? "}" : opener === "[" ? "]" : undefined;
  if (!closer) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function cleanJsonSource(source: string | null | undefined): string | undefined {
  const cleaned = source
    ?.replace(/^<!--/, "")
    .replace(/-->$/, "")
    .trim();

  return cleaned || undefined;
}

function dedupeEmbeddedItems(items: EmbeddedDataItem[]): EmbeddedDataItem[] {
  const seen = new Set<string>();
  const unique: EmbeddedDataItem[] = [];

  for (const item of items) {
    const key = `${item.source}:${item.path ?? ""}:${JSON.stringify(item.data).slice(0, 500)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function isRecord(value: unknown): value is JsonLdNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
