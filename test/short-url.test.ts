import { describe, expect, it } from "vitest";
import { detectShortUrl, normalizeUrl, resolveCanonicalUrl, validateUrl } from "../src/index.js";

describe("URL resolver helpers", () => {
  it("detects common short URL providers without network access", () => {
    expect(detectShortUrl("https://pin.it/abc")).toEqual({ isShortUrl: true, provider: "Pinterest" });
    expect(detectShortUrl("https://redd.it/abc")).toEqual({ isShortUrl: true, provider: "Reddit" });
    expect(detectShortUrl("https://t.co/abc")).toEqual({ isShortUrl: true, provider: "X" });
    expect(detectShortUrl("https://bit.ly/abc")).toEqual({ isShortUrl: true, provider: "Bitly" });
    expect(detectShortUrl("https://tinyurl.com/abc")).toEqual({ isShortUrl: true, provider: "TinyURL" });
    expect(detectShortUrl("https://youtu.be/abc")).toEqual({ isShortUrl: true, provider: "YouTube" });
    expect(detectShortUrl("https://example.com/abc")).toEqual({ isShortUrl: false, provider: undefined });
  });

  it("validates, normalizes, and resolves canonical URLs", () => {
    expect(validateUrl("https://Example.com/path").hostname).toBe("example.com");
    expect(normalizeUrl("https://Example.com:443/path#section")).toBe("https://example.com/path");
    expect(resolveCanonicalUrl("/canonical", "https://example.com/post")).toBe("https://example.com/canonical");
  });
});
