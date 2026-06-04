import { parseMetadata } from "metanova";

const docsPlugin = {
  name: "docs-plugin",
  setup(api) {
    api.addExtractor("docs-meta", ({ $ }) => ({
      source: "docs-meta",
      title: $("meta[name='doc:title']").attr("content"),
      siteName: "Docs"
    }));

    api.addImageScorer((image) => (image.url.includes("/hero/") ? 12 : 0));
  }
};

const metadata = parseMetadata(
  `<meta name="doc:title" content="Plugin powered docs"><img src="/hero/docs.jpg" width="1200" height="630">`,
  "https://docs.example.com/guide",
  { plugins: [docsPlugin] }
);

console.log({
  title: metadata.title,
  siteName: metadata.siteName,
  bestImage: metadata.bestImage
});
