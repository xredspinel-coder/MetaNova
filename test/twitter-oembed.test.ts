import { describe, expect, it } from "vitest";
import { extractOEmbed, extractTwitterCards } from "../src/index.js";

describe("Twitter image merge and flexible oEmbed discovery", () => {
  it("merges multiple Twitter image fields and removes duplicates", () => {
    const twitter = extractTwitterCards(`
      <meta name="twitter:image" content="/one.jpg">
      <meta name="twitter:image:src" content="/two.jpg">
      <meta name="twitter:image0" content="/three.jpg">
      <meta name="twitter:image:1" content="/two.jpg">
      <meta name="twitter:player:image" content="/player.jpg">
    `);

    expect(twitter.images.map((image) => image.url)).toEqual(["/one.jpg", "/two.jpg", "/three.jpg", "/player.jpg"]);
  });

  it("discovers oEmbed links with tokenized rel values", () => {
    const oembed = extractOEmbed(`
      <link rel="preconnect alternate" type="application/json+oembed" href="/oembed.json" title="oEmbed JSON">
      <link rel="alternate-oembed" href="/another-oembed?format=json">
    `, "https://example.com/post");

    expect(oembed.links.map((link) => link.href)).toEqual([
      "https://example.com/oembed.json",
      "https://example.com/another-oembed?format=json"
    ]);
  });
});
