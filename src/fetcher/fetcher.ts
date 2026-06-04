import type { FetchMetadataOptions, MetaNovaCacheEntry, RedirectEntry } from "../types/index.js";
import { detectShortUrl, normalizeUrl, resolveUrl } from "../utils/url.js";
import { assertSafeRequestUrl } from "./security.js";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 2_000_000;
export const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
export const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
export const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";
export const DEFAULT_ACCEPT_ENCODING = "gzip, deflate, br";

export interface FetchedPage {
  url: string;
  originalUrl: string;
  finalUrl: string;
  isShortUrl: boolean;
  shortUrlProvider?: string;
  html: string;
  bytes?: Uint8Array;
  statusCode: number;
  contentType?: string;
  redirects: RedirectEntry[];
  headers: Record<string, string>;
}

export async function fetchPage(inputUrl: string, options: FetchMetadataOptions = {}): Promise<FetchedPage> {
  const startUrl = normalizeUrl(inputUrl);
  const cached = await options.cache?.get(startUrl);

  if (cached) {
    return fromCache(startUrl, cached);
  }

  const retries = options.retries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const page = await requestWithRedirects(startUrl, options);
      await options.cache?.set(startUrl, {
        html: page.html,
        finalUrl: page.finalUrl,
        statusCode: page.statusCode,
        contentType: page.contentType,
        redirects: page.redirects
      });
      return page;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await delay(options.retryDelayMs ?? 250);
      }
    }
  }

  throw lastError;
}

export interface RedirectResolution {
  originalUrl: string;
  finalUrl: string;
  redirects: RedirectEntry[];
  isShortUrl: boolean;
  shortUrlProvider?: string;
}

export async function resolveRedirects(inputUrl: string, options: FetchMetadataOptions = {}): Promise<RedirectResolution> {
  const originalUrl = normalizeUrl(inputUrl);
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const fetchImpl = options.fetch ?? fetch;
  const redirects: RedirectEntry[] = [];
  let currentUrl = await assertSafeRequestUrl(originalUrl, options);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await requestOnce(fetchImpl, currentUrl, options);
    const statusCode = response.status;

    if (!isRedirect(statusCode)) {
      const shortUrl = detectShortUrl(originalUrl);
      return {
        originalUrl,
        finalUrl: currentUrl,
        redirects,
        isShortUrl: shortUrl.isShortUrl,
        shortUrlProvider: shortUrl.provider
      };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Redirect response from ${currentUrl} did not include a Location header.`);
    }

    const nextUrl = await assertSafeRequestUrl(resolveUrl(location, currentUrl), options);
    redirects.push({ from: currentUrl, to: nextUrl, statusCode });
    currentUrl = nextUrl;
  }

  throw new Error(`Too many redirects. Maximum allowed redirects: ${maxRedirects}.`);
}

async function requestWithRedirects(inputUrl: string, options: FetchMetadataOptions): Promise<FetchedPage> {
  const fetchImpl = options.fetch ?? fetch;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const redirects: RedirectEntry[] = [];
  const shortUrl = detectShortUrl(inputUrl);
  let currentUrl = await assertSafeRequestUrl(inputUrl, options);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await requestOnce(fetchImpl, currentUrl, options);
    const statusCode = response.status;

    if (isRedirect(statusCode)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`Redirect response from ${currentUrl} did not include a Location header.`);
      }

      const nextUrl = await assertSafeRequestUrl(resolveUrl(location, currentUrl), options);
      redirects.push({ from: currentUrl, to: nextUrl, statusCode });
      currentUrl = nextUrl;
      continue;
    }

    const headers = headersToRecord(response.headers);
    const body = await readLimitedBody(response, options.maxBytes ?? DEFAULT_MAX_BYTES);

    return {
      url: inputUrl,
      originalUrl: inputUrl,
      finalUrl: currentUrl,
      isShortUrl: shortUrl.isShortUrl,
      shortUrlProvider: shortUrl.provider,
      html: body.text,
      bytes: body.bytes,
      statusCode,
      contentType: response.headers.get("content-type") ?? undefined,
      redirects,
      headers
    };
  }

  throw new Error(`Too many redirects. Maximum allowed redirects: ${maxRedirects}.`);
}

async function requestOnce(fetchImpl: typeof fetch, url: string, options: FetchMetadataOptions): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Request timed out.")), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const externalSignal = options.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  try {
    return await fetchImpl(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: buildBrowserLikeHeaders(options)
    });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

function buildBrowserLikeHeaders(options: FetchMetadataOptions): Record<string, string> {
  return {
    "accept": options.accept ?? DEFAULT_ACCEPT,
    "accept-language": options.acceptLanguage ?? DEFAULT_ACCEPT_LANGUAGE,
    "accept-encoding": options.acceptEncoding ?? DEFAULT_ACCEPT_ENCODING,
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "sec-ch-ua": '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": options.userAgent ?? DEFAULT_BROWSER_USER_AGENT,
    ...headersToObject(options.headers)
  };
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<{ text: string; bytes: Uint8Array }> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new Error(`Response body exceeds maxBytes (${maxBytes}).`);
  }

  if (!response.body) {
    const text = await response.text();
    return {
      text,
      bytes: new TextEncoder().encode(text)
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        throw new Error(`Response body exceeds maxBytes (${maxBytes}).`);
      }
      chunks.push(value);
    }
  }

  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: decodeBytes(buffer, response.headers.get("content-type")),
    bytes: buffer
  };
}

function fromCache(url: string, entry: MetaNovaCacheEntry): FetchedPage {
  const shortUrl = detectShortUrl(url);

  return {
    url,
    originalUrl: url,
    finalUrl: entry.finalUrl ?? url,
    isShortUrl: shortUrl.isShortUrl,
    shortUrlProvider: shortUrl.provider,
    html: entry.html,
    statusCode: entry.statusCode ?? 200,
    contentType: entry.contentType,
    redirects: entry.redirects ?? [],
    headers: {}
  };
}

function isRedirect(statusCode: number): boolean {
  return statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308;
}

function extractCharset(contentType: string | null): string {
  const charset = contentType?.match(/charset=([^;]+)/i)?.[1]?.trim().replace(/^["']|["']$/g, "");
  return charset || "utf-8";
}

function decodeBytes(buffer: Uint8Array, contentType: string | null): string {
  try {
    return new TextDecoder(extractCharset(contentType)).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(new Headers(headers).entries());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
