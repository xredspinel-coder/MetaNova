const { parseMetadata } = require("metanova");

const metadata = parseMetadata(
  `<title>CommonJS example</title><meta name="description" content="Loaded with require.">`,
  "https://example.com/commonjs"
);

console.log({
  title: metadata.title,
  type: metadata.type,
  confidence: metadata.confidence
});
