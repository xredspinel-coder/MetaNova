import { parseMetadata } from "metanova";

const docsAdapter = {
  name: "docsAdapter",
  detect(url) {
    return url.hostname === "docs.example.com";
  },
  extract({ raw }) {
    return {
      source: "docsAdapter",
      title: raw.openGraph.title,
      description: raw.openGraph.description,
      images: raw.openGraph.images,
      platform: "Example Docs"
    };
  },
  normalize(rawData) {
    return {
      ...rawData,
      source: "docsAdapter",
      type: "article",
      siteName: rawData.platform
    };
  }
};

const metadata = parseMetadata(`
  <meta property="og:title" content="Adapter example">
  <meta property="og:description" content="Custom site-specific behavior.">
  <meta property="og:image" content="/adapter.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
`, "https://docs.example.com/guides/adapter", {
  adapters: [docsAdapter]
});

console.log({
  type: metadata.type,
  siteName: metadata.siteName,
  title: metadata.title
});
