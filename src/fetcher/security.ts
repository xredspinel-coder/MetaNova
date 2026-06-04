import { lookup } from "node:dns/promises";
import net from "node:net";
import type { FetchMetadataOptions } from "../types/index.js";
import { classifyIp, isLocalHostname, normalizeUrl } from "../utils/url.js";

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

export async function assertSafeRequestUrl(input: string, options: FetchMetadataOptions = {}): Promise<string> {
  const protocols = options.allowedProtocols ?? ["http:", "https:"];
  let normalizedUrl: string;

  try {
    normalizedUrl = normalizeUrl(input, { allowedProtocols: protocols });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new SecurityError(error.message);
    }

    throw error;
  }

  const url = new URL(normalizedUrl);

  if (!protocols.includes(url.protocol)) {
    throw new SecurityError(`Unsupported URL protocol: ${url.protocol}`);
  }

  const hostname = url.hostname;

  if (isLocalHostname(hostname) && !options.allowLocalhost) {
    throw new SecurityError("Localhost URLs are blocked by default.");
  }

  const literalIp = net.isIP(hostname) ? hostname : undefined;
  if (literalIp) {
    assertPublicAddressAllowed(literalIp, options);
    return url.toString();
  }

  if (options.allowPrivateNetwork && options.allowLocalhost) {
    return url.toString();
  }

  const records = await lookup(hostname, { all: true, verbatim: false });
  for (const record of records) {
    assertPublicAddressAllowed(record.address, options);
  }

  return url.toString();
}

function assertPublicAddressAllowed(address: string, options: FetchMetadataOptions): void {
  const classification = classifyIp(address);

  if (classification === "loopback" && !options.allowLocalhost) {
    throw new SecurityError(`Loopback address is blocked: ${address}`);
  }

  if (classification !== "public" && classification !== "loopback" && !options.allowPrivateNetwork) {
    throw new SecurityError(`Private or reserved network address is blocked: ${address}`);
  }
}
