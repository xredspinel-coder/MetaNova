import net from "node:net";

export interface ValidateUrlOptions {
  allowedProtocols?: string[];
}

export interface ShortUrlInfo {
  isShortUrl: boolean;
  provider?: string;
}

const SHORT_URL_HOSTS: Record<string, string> = {
  "pin.it": "Pinterest",
  "redd.it": "Reddit",
  "t.co": "X",
  "bit.ly": "Bitly",
  "tinyurl.com": "TinyURL",
  "youtu.be": "YouTube"
};

export function validateUrl(input: string, options: ValidateUrlOptions = {}): URL {
  const url = new URL(input);
  const allowedProtocols = options.allowedProtocols ?? ["http:", "https:"];

  if (!allowedProtocols.includes(url.protocol)) {
    throw new TypeError(`Unsupported URL protocol: ${url.protocol}`);
  }

  return url;
}

export function resolveUrl(url: string, baseUrl?: string): string {
  const resolved = baseUrl ? new URL(url, baseUrl) : new URL(url);
  return normalizeUrl(resolved.toString());
}

export function tryResolveUrl(url: string | undefined, baseUrl?: string): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return resolveUrl(url, baseUrl);
  } catch {
    return undefined;
  }
}

export function normalizeUrl(input: string, options: ValidateUrlOptions = {}): string {
  const url = validateUrl(input, options);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }

  return url.toString();
}

export function detectShortUrl(input: string | URL): ShortUrlInfo {
  const url = typeof input === "string" ? validateUrl(input) : input;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const provider = SHORT_URL_HOSTS[hostname];

  return {
    isShortUrl: Boolean(provider),
    provider
  };
}

export function resolveCanonicalUrl(canonicalUrl: string | undefined, baseUrl: string): string | undefined {
  return tryResolveUrl(canonicalUrl, baseUrl);
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

export function classifyIp(address: string): "public" | "loopback" | "private" | "linkLocal" | "reserved" {
  const ipVersion = net.isIP(address);

  if (ipVersion === 4) {
    return classifyIpv4(address);
  }

  if (ipVersion === 6) {
    return classifyIpv6(address);
  }

  return "public";
}

function classifyIpv4(address: string): "public" | "loopback" | "private" | "linkLocal" | "reserved" {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  const [a, b] = parts;

  if (a === 127) {
    return "loopback";
  }

  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    return "private";
  }

  if (a === 169 && b === 254) {
    return "linkLocal";
  }

  if (
    a === 0 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  ) {
    return "reserved";
  }

  return "public";
}

function classifyIpv6(address: string): "public" | "loopback" | "private" | "linkLocal" | "reserved" {
  const normalized = address.toLowerCase();

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return "loopback";
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return "private";
  }

  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return "linkLocal";
  }

  if (normalized === "::" || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.")) {
    return "reserved";
  }

  return "public";
}
