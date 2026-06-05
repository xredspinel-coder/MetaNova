# CHANGELOG

## v0.2.2

Release date: 2026-06-05

### Changed

- Improved Reddit image extraction quality by filtering tiny thumbnails, community chrome, avatar/icon/award/emoji assets, and unrelated page preview media.
- Improved Reddit media prioritization so gallery images, `preview.redd.it`, and `i.redd.it` media are preferred over external previews and thumbnail hosts.
- Improved TikTok post extraction by using the real video detail payload when available and rejecting generic TikTok Shop/navigation template titles.
- Kept normalized media collections (`images`, `videos`, `audio`, and `favicons`) present as arrays even when empty.

### Fixed

- Fixed multi-image Reddit posts returning only social preview images instead of ordered gallery media.
- Fixed successful old.reddit fallback diagnostics so blocked Reddit JSON attempts are reported as informational fallback trace entries instead of warnings.
- Fixed preview card handling so a valid `bestImage` is always available to consumers even when image candidate arrays are empty.

## v0.2.1

Release date: 2026-06-04

### Fixed

- Fixed Reddit verification/block pages that returned HTTP 200 being treated as successful metadata.
- Fixed blocked Reddit fallback handling so provider diagnostics clearly report blocked status, reason, status code, and suggested action.
- Fixed Reddit verification titles such as `Reddit - Please wait for verification` leaking into `metadata.title`.

## v0.2.0

Release date: 2026-06-04

### Added

- Added deterministic YouTube source prioritization for structured `VideoObject`, `ytInitialPlayerResponse`, `ytInitialData`, Open Graph, Twitter Cards, and HTML fallbacks.
- Added a dedicated Reddit fetch strategy with Reddit JSON, old.reddit, embedded structured data, Open Graph, and HTML fallback diagnostics.
- Added richer diagnostics fields: `adapterUsed`, `sourcePriority`, `extractionMethod`, `fallbacksAttempted`, `retryInfo`, and `confidenceBreakdown`.
- Added top-level `publishDate` convenience output while preserving existing article/video date fields.
- Added broader media discovery for lazy attributes, `imagesrcset`, social media payload keys, preload links, platform media hosts, posters, and embedded JSON payloads.

### Changed

- Improved image candidate scoring to prefer large preview images, platform thumbnails, Open Graph images, Twitter images, and high-resolution sources.
- Improved social platform adapter output for YouTube, Reddit, X/Twitter, Facebook, Instagram, Pinterest, TikTok, and Behance.
- Improved diagnostics trace output so developers can understand why a field or image was selected.

### Fixed

- Fixed unstable YouTube titles caused by unrelated playlist, channel, related-content, or generic metadata candidates outranking the current video.
- Fixed Reddit cloud-provider reliability gaps by exposing blocked fetch attempts and retry guidance.
- Fixed media candidate ranking cases where avatars, logos, icons, or tracking pixels could compete with preview-quality assets.

### Removed

- Nothing.

## v0.1.0

Release date: 2026-06-04

### Added

- Initial public release.

### Changed

- Nothing.

### Fixed

- Nothing.

### Removed

- Nothing.
