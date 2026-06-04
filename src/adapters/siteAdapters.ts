import type { AdapterContext, AdapterExtractionResult, Entity, JsonLdNode, MediaAsset, MetadataType, SiteAdapter } from "../types/index.js";
import { discoverMedia } from "../media/index.js";

type PlatformRawData = AdapterExtractionResult & {
  platform?: string;
  identifiers?: Record<string, string | undefined>;
};

interface TextSelection {
  value?: string;
  method?: string;
}

export const youtubeAdapter: SiteAdapter<PlatformRawData> = {
  name: "youtubeAdapter",
  detect(url) {
    return hostMatches(url, ["youtube.com", "youtu.be", "youtube-nocookie.com"]);
  },
  canHandle(url) {
    return this.detect?.(url) ?? false;
  },
  extract(context) {
    const url = new URL(context.finalUrl);
    const videoId = getYouTubeVideoId(url);
    const playlistId = getYouTubePlaylistId(url);
    const communityPostId = getYouTubeCommunityPostId(url);
    const titleSelection = youtubeTitleFromContext(context, { videoId, playlistId, communityPostId });
    const descriptionSelection = youtubeDescriptionFromContext(context);
    const channel = entityFromContext(context, ["author", "ownerChannelName", "channel", "owner"]);
    const playlistVideos = playlistId ? extractPlaylistVideos(context) : [];
    const sourcePriority = youtubeSourcePriority();

    return compactAdapterResult({
      source: "youtubeAdapter",
      platform: "YouTube",
      type: playlistId ? "playlist" : communityPostId ? "social_post" : "video",
      siteName: "YouTube",
      canonicalUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : context.raw.openGraph.url,
      title: titleSelection.value,
      description: descriptionSelection.value,
      videos: markAdapterMedia(mediaFromContext(context).videos, "youtubeAdapter"),
      images: markAdapterMedia(mediaFromContext(context).images, "youtubeAdapter"),
      author: channel,
      article: { publishedTime: publishedTimeFromContext(context) },
      video: videoId
        ? {
            id: videoId,
            title: titleSelection.value,
            channel,
            publishedTime: publishedTimeFromContext(context),
            duration: findEmbeddedString(context, ["duration", "lengthSeconds", "approxDurationMs"]),
            tags: arrayFromContext(context, ["tags", "keywords"]),
            category: findEmbeddedString(context, ["category"]),
            viewCount: numberFromContext(context, ["viewCount", "views"])
          }
        : undefined,
      playlist: playlistId
        ? {
            id: playlistId,
            title: youtubePlaylistTitleFromContext(context) ?? context.raw.openGraph.title,
            channel,
            videos: playlistVideos
          }
        : undefined,
      identifiers: { videoId, playlistId, communityPostId },
      raw: {
        sourcePriority,
        extractionMethod: titleSelection.method ?? descriptionSelection.method ?? "youtube:htmlFallback"
      }
    });
  },
  normalize(rawData) {
    return normalizePlatformResult(rawData);
  }
};

export const redditAdapter: SiteAdapter<PlatformRawData> = {
  name: "redditAdapter",
  detect(url) {
    return hostMatches(url, ["reddit.com", "redd.it"]);
  },
  canHandle(url) {
    return this.detect?.(url) ?? false;
  },
  extract(context) {
    const url = new URL(context.finalUrl);
    const reddit = parseRedditUrl(url);
    const username = typeof reddit.username === "string" ? reddit.username : undefined;
    const titleSelection = redditTitleFromContext(context);
    const descriptionSelection = redditDescriptionFromContext(context);
    const sourcePriority = redditSourcePriority();

    return compactAdapterResult({
      source: "redditAdapter",
      platform: "Reddit",
      type: reddit.isPost ? "social_post" : "website",
      siteName: "Reddit",
      canonicalUrl: context.raw.openGraph.url ?? context.raw.html.canonicalUrl,
      title: cleanSocialTitle(titleSelection.value),
      description: descriptionSelection.value,
      images: markAdapterMedia(mediaFromContext(context).images, "redditAdapter"),
      videos: markAdapterMedia(mediaFromContext(context).videos, "redditAdapter"),
      author: username ? { name: username } : entityFromContext(context, ["author", "submitter", "user"]),
      article: { publishedTime: publishedTimeFromContext(context) },
      identifiers: { subreddit: reddit.subreddit, postId: reddit.postId, username: reddit.username },
      raw: {
        ...reddit,
        sourcePriority,
        extractionMethod: titleSelection.method ?? descriptionSelection.method ?? "reddit:htmlFallback"
      }
    });
  },
  normalize(rawData) {
    return normalizePlatformResult(rawData);
  }
};

export const pinterestAdapter: SiteAdapter<PlatformRawData> = {
  name: "pinterestAdapter",
  detect(url) {
    return hostMatches(url, ["pinterest.com", "pin.it"]);
  },
  canHandle(url) {
    return this.detect?.(url) ?? false;
  },
  extract(context) {
    const url = new URL(context.finalUrl);
    const pinId = url.pathname.match(/\/pin\/([^/]+)/)?.[1];

    return compactAdapterResult({
      source: "pinterestAdapter",
      platform: "Pinterest",
      type: pinId || hostMatches(url, ["pin.it"]) ? "social_post" : "image",
      siteName: "Pinterest",
      canonicalUrl: context.raw.openGraph.url,
      title: titleFromContext(context, ["title", "pinTitle", "gridTitle", "headline", "name"]),
      description: descriptionFromContext(context),
      images: markAdapterMedia(mediaFromContext(context).images, "pinterestAdapter"),
      videos: markAdapterMedia(mediaFromContext(context).videos, "pinterestAdapter"),
      author: entityFromContext(context, ["pinner", "author", "creator", "owner", "user"]),
      article: { publishedTime: publishedTimeFromContext(context) },
      identifiers: { pinId }
    });
  },
  normalize(rawData) {
    return normalizePlatformResult(rawData);
  }
};

export const behanceAdapter: SiteAdapter<PlatformRawData> = {
  name: "behanceAdapter",
  detect(url) {
    return hostMatches(url, ["behance.net"]);
  },
  canHandle(url) {
    return this.detect?.(url) ?? false;
  },
  extract(context) {
    const url = new URL(context.finalUrl);
    const projectId = url.pathname.match(/\/gallery\/(\d+)/)?.[1];

    return compactAdapterResult({
      source: "behanceAdapter",
      platform: "Behance",
      type: projectId ? "image" : "website",
      siteName: "Behance",
      canonicalUrl: context.raw.openGraph.url,
      title: titleFromContext(context, ["title", "projectTitle", "name", "headline"]),
      description: descriptionFromContext(context),
      images: markAdapterMedia(mediaFromContext(context).images, "behanceAdapter"),
      videos: markAdapterMedia(mediaFromContext(context).videos, "behanceAdapter"),
      author: entityFromContext(context, ["owners", "author", "creator", "user"]),
      article: { publishedTime: publishedTimeFromContext(context) },
      raw: { projectId }
    });
  },
  normalize(rawData) {
    return normalizePlatformResult(rawData);
  }
};

export const tiktokAdapter: SiteAdapter<PlatformRawData> = {
  name: "tiktokAdapter",
  detect(url) {
    return hostMatches(url, ["tiktok.com"]);
  },
  canHandle(url) {
    return this.detect?.(url) ?? false;
  },
  extract(context) {
    return socialVideoResult("tiktokAdapter", "TikTok", context);
  },
  normalize(rawData) {
    return normalizePlatformResult(rawData);
  }
};

export const facebookAdapter: SiteAdapter<PlatformRawData> = {
  name: "facebookAdapter",
  detect(url) {
    return hostMatches(url, ["facebook.com", "fb.watch"]);
  },
  canHandle(url) {
    return this.detect?.(url) ?? false;
  },
  extract(context) {
    const url = new URL(context.finalUrl);
    const isPost = /\/(?:posts|photo|videos|watch|reel|share)\//i.test(url.pathname) || url.searchParams.has("story_fbid");
    const isPhoto = url.pathname.includes("photo.php") || url.searchParams.has("fbid");
    const postId = url.searchParams.get("story_fbid") ?? url.pathname.match(/\/(?:posts|videos|reel)\/([^/]+)/)?.[1];
    const media = mediaFromContext(context);

    return compactAdapterResult({
      source: "facebookAdapter",
      platform: "Facebook",
      type: isPhoto ? "image" : isPost || media.images.length > 0 || media.videos.length > 0 ? "social_post" : "website",
      siteName: "Facebook",
      canonicalUrl: context.raw.openGraph.url,
      title: titleFromContext(context, ["title", "headline", "name"]),
      description: descriptionFromContext(context),
      images: markAdapterMedia(media.images, "facebookAdapter"),
      videos: markAdapterMedia(media.videos, "facebookAdapter"),
      author: entityFromContext(context, ["author", "owner", "profile", "user"]),
      article: { publishedTime: publishedTimeFromContext(context) },
      identifiers: { postId }
    });
  },
  normalize(rawData) {
    return normalizePlatformResult(rawData);
  }
};

export const twitterAdapter: SiteAdapter<PlatformRawData> = {
  name: "twitterAdapter",
  detect(url) {
    return hostMatches(url, ["twitter.com", "x.com", "t.co"]);
  },
  canHandle(url) {
    return this.detect?.(url) ?? false;
  },
  extract(context) {
    const url = new URL(context.finalUrl);
    const statusId = url.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1];

    return compactAdapterResult({
      source: "twitterAdapter",
      platform: "X",
      type: statusId || hostMatches(url, ["t.co"]) ? "social_post" : "profile",
      siteName: "X",
      canonicalUrl: context.raw.openGraph.url,
      title: titleFromContext(context, ["title", "full_text", "text", "headline"]),
      description: descriptionFromContext(context),
      images: markAdapterMedia(mediaFromContext(context).images, "twitterAdapter"),
      videos: markAdapterMedia(mediaFromContext(context).videos, "twitterAdapter"),
      author: entityFromContext(context, ["author", "user", "screen_name", "creator"]),
      article: { publishedTime: publishedTimeFromContext(context) },
      identifiers: { statusId }
    });
  },
  normalize(rawData) {
    return normalizePlatformResult(rawData);
  }
};

export const instagramAdapter: SiteAdapter<PlatformRawData> = {
  name: "instagramAdapter",
  detect(url) {
    return hostMatches(url, ["instagram.com"]);
  },
  canHandle(url) {
    return this.detect?.(url) ?? false;
  },
  extract(context) {
    const url = new URL(context.finalUrl);
    const shortcode = url.pathname.match(/\/(?:p|reel|tv)\/([^/]+)/)?.[1];

    return compactAdapterResult({
      source: "instagramAdapter",
      platform: "Instagram",
      type: shortcode ? "social_post" : "profile",
      siteName: "Instagram",
      canonicalUrl: context.raw.openGraph.url,
      title: titleFromContext(context, ["title", "caption", "edge_media_to_caption", "headline"]),
      description: descriptionFromContext(context),
      images: markAdapterMedia(mediaFromContext(context).images, "instagramAdapter"),
      videos: markAdapterMedia(mediaFromContext(context).videos, "instagramAdapter"),
      author: entityFromContext(context, ["owner", "author", "user", "username"]),
      article: { publishedTime: publishedTimeFromContext(context) },
      identifiers: { shortcode }
    });
  },
  normalize(rawData) {
    return normalizePlatformResult(rawData);
  }
};

export const defaultAdapters: SiteAdapter[] = [
  youtubeAdapter,
  redditAdapter,
  pinterestAdapter,
  behanceAdapter,
  tiktokAdapter,
  facebookAdapter,
  twitterAdapter,
  instagramAdapter
];

function youtubeSourcePriority(): string[] {
  return [
    "structuredData:VideoObject",
    "embeddedData:ytInitialPlayerResponse",
    "embeddedData:ytInitialData",
    "openGraph",
    "twitter",
    "html"
  ];
}

function youtubeTitleFromContext(
  context: AdapterContext,
  ids: { videoId?: string; playlistId?: string; communityPostId?: string }
): TextSelection {
  const videoObjectTitle = jsonLdVideoObjectString(context, ["name", "headline"]);
  if (videoObjectTitle) {
    return { value: videoObjectTitle, method: "youtube:structuredData.VideoObject" };
  }

  const playerTitle = youtubePlayerString(context, ["videoDetails.title", "microformat.playerMicroformatRenderer.title"]);
  if (playerTitle) {
    return { value: playerTitle, method: "youtube:ytInitialPlayerResponse" };
  }

  const initialDataTitle = youtubeInitialDataTitle(context, ids);
  if (initialDataTitle) {
    return { value: initialDataTitle, method: "youtube:ytInitialData" };
  }

  if (context.raw.openGraph.title) {
    return { value: context.raw.openGraph.title, method: "youtube:openGraph" };
  }

  if (context.raw.twitter.title) {
    return { value: context.raw.twitter.title, method: "youtube:twitter" };
  }

  return { value: cleanYouTubeHtmlTitle(context.raw.html.title), method: context.raw.html.title ? "youtube:html" : undefined };
}

function youtubeDescriptionFromContext(context: AdapterContext): TextSelection {
  const videoObjectDescription = jsonLdVideoObjectString(context, ["description"]);
  if (videoObjectDescription) {
    return { value: videoObjectDescription, method: "youtube:structuredData.VideoObject" };
  }

  const playerDescription = youtubePlayerString(context, [
    "videoDetails.shortDescription",
    "microformat.playerMicroformatRenderer.description",
    "microformat.playerMicroformatRenderer.shortDescription"
  ]);
  if (playerDescription) {
    return { value: playerDescription, method: "youtube:ytInitialPlayerResponse" };
  }

  const initialDataDescription = youtubeInitialDataDescription(context);
  if (initialDataDescription) {
    return { value: initialDataDescription, method: "youtube:ytInitialData" };
  }

  if (context.raw.openGraph.description) {
    return { value: context.raw.openGraph.description, method: "youtube:openGraph" };
  }

  if (context.raw.twitter.description) {
    return { value: context.raw.twitter.description, method: "youtube:twitter" };
  }

  return { value: context.raw.html.description, method: context.raw.html.description ? "youtube:html" : undefined };
}

function redditSourcePriority(): string[] {
  return [
    "redditJsonEndpoint",
    "oldReddit",
    "embeddedStructuredData",
    "openGraph",
    "twitter",
    "html"
  ];
}

function redditTitleFromContext(context: AdapterContext): TextSelection {
  const embedded = findEmbeddedStringBySources(context, ["applicationJson", "jsonScript", "initialState", "preloadedState", "nextData"], [
    "postTitle",
    "title",
    "headline"
  ]);
  if (embedded) {
    return { value: embedded, method: hasRedditJsonEndpointPayload(context) ? "reddit:jsonEndpoint" : "reddit:embeddedStructuredData" };
  }

  const structured = jsonLdStringByType(context.raw.jsonLd.nodes, ["SocialMediaPosting", "DiscussionForumPosting", "Article"], ["headline", "name"]);
  if (structured) {
    return { value: structured, method: "reddit:structuredData" };
  }

  if (context.raw.openGraph.title) {
    return { value: context.raw.openGraph.title, method: "reddit:openGraph" };
  }

  if (context.raw.twitter.title) {
    return { value: context.raw.twitter.title, method: "reddit:twitter" };
  }

  return { value: context.raw.html.title, method: context.raw.html.title ? "reddit:html" : undefined };
}

function redditDescriptionFromContext(context: AdapterContext): TextSelection {
  const embedded = findEmbeddedStringBySources(context, ["applicationJson", "jsonScript", "initialState", "preloadedState", "nextData"], [
    "description",
    "selftext",
    "excerpt",
    "summary",
    "body"
  ]);
  if (embedded) {
    return { value: embedded, method: hasRedditJsonEndpointPayload(context) ? "reddit:jsonEndpoint" : "reddit:embeddedStructuredData" };
  }

  const structured = jsonLdStringByType(context.raw.jsonLd.nodes, ["SocialMediaPosting", "DiscussionForumPosting", "Article"], ["description", "articleBody"]);
  if (structured) {
    return { value: structured, method: "reddit:structuredData" };
  }

  if (context.raw.openGraph.description) {
    return { value: context.raw.openGraph.description, method: "reddit:openGraph" };
  }

  if (context.raw.twitter.description) {
    return { value: context.raw.twitter.description, method: "reddit:twitter" };
  }

  return { value: context.raw.html.description, method: context.raw.html.description ? "reddit:html" : undefined };
}

function socialVideoResult(source: string, platform: string, context: AdapterContext): PlatformRawData {
  const url = new URL(context.finalUrl);
  const username = url.pathname.match(/@([^/]+)/)?.[1];
  const postId = url.pathname.match(/\/(?:video|photo)\/([^/]+)/)?.[1] ?? url.pathname.split("/").filter(Boolean).at(-1);

  return compactAdapterResult({
    source,
    platform,
    type: "social_post",
    siteName: platform,
    canonicalUrl: context.raw.openGraph.url,
    title: titleFromContext(context, ["title", "desc", "description", "caption"]),
    description: descriptionFromContext(context),
    images: markAdapterMedia(mediaFromContext(context).images, source),
    videos: markAdapterMedia(mediaFromContext(context).videos, source),
    author: username ? { name: username } : entityFromContext(context, ["author", "user", "creator", "owner"]),
    article: { publishedTime: publishedTimeFromContext(context) },
    identifiers: { username, postId }
  });
}

function normalizePlatformResult(rawData: PlatformRawData): AdapterExtractionResult {
  const type = rawData.type ?? inferAdapterType(rawData);

  return compactAdapterResult({
    ...rawData,
    type,
    raw: {
      ...(rawData.raw ?? {}),
      platform: rawData.platform,
      identifiers: rawData.identifiers
    }
  });
}

function inferAdapterType(rawData: PlatformRawData): MetadataType {
  if ((rawData.videos?.length ?? 0) > 0) {
    return "video";
  }

  if ((rawData.images?.length ?? 0) > 0) {
    return "image";
  }

  return "website";
}

function markAdapterMedia(assets: MediaAsset[], adapterName: string): MediaAsset[] {
  const seen = new Set<string>();

  return assets.filter((asset) => {
    if (seen.has(asset.url)) {
      return false;
    }
    seen.add(asset.url);
    return true;
  }).map((asset) => ({
    ...asset,
    source: "adapter",
    metadata: {
      ...asset.metadata,
      adapter: adapterName,
      originalSource: asset.source
      }
    }));
}

function jsonLdVideoObjectString(context: AdapterContext, keys: string[]): string | undefined {
  return jsonLdStringByType(context.raw.jsonLd.nodes, ["VideoObject"], keys);
}

function jsonLdStringByType(nodes: JsonLdNode[], types: string[], keys: string[]): string | undefined {
  for (const node of nodes) {
    if (!hasJsonLdType(node, types)) {
      continue;
    }

    for (const key of keys) {
      const value = stringFromUnknown(node[key]);
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function hasJsonLdType(node: JsonLdNode, types: string[]): boolean {
  const nodeTypes = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  return nodeTypes.some((type) => typeof type === "string" && types.some((candidate) => type.toLowerCase().endsWith(candidate.toLowerCase())));
}

function youtubePlayerString(context: AdapterContext, paths: string[]): string | undefined {
  for (const item of context.raw.embeddedData.items) {
    if (item.source !== "youtubePlayerResponse") {
      continue;
    }

    for (const path of paths) {
      const value = stringFromUnknown(valueAtPath(item.data, path));
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function youtubeInitialDataTitle(
  context: AdapterContext,
  ids: { videoId?: string; playlistId?: string; communityPostId?: string }
): string | undefined {
  const items = context.raw.embeddedData.items.filter((item) => item.source === "youtubeInitialData");

  const primary = findRendererText(items, ["videoPrimaryInfoRenderer", "watchMetadata"], ["title"]);
  if (primary) {
    return primary;
  }

  if (ids.videoId) {
    const matchingVideo = findYouTubeRendererForVideoId(items, ids.videoId, ["title"]);
    if (matchingVideo) {
      return matchingVideo;
    }
  }

  if (ids.communityPostId) {
    const communityPost =
      findEmbeddedStringBySources(context, ["youtubeInitialData"], ["contentText"]) ??
      findRendererText(items, ["backstagePostRenderer", "postRenderer"], ["contentText", "title"]);
    if (communityPost) {
      return communityPost;
    }
  }

  if (ids.playlistId && !ids.videoId) {
    return findRendererText(items, ["playlistMetadataRenderer", "playlistHeaderRenderer"], ["title", "playlistTitle", "name"]);
  }

  return undefined;
}

function youtubeInitialDataDescription(context: AdapterContext): string | undefined {
  const items = context.raw.embeddedData.items.filter((item) => item.source === "youtubeInitialData");
  return findRendererText(items, ["expandableVideoDescriptionBodyRenderer", "videoSecondaryInfoRenderer", "watchMetadata"], [
    "description",
    "attributedDescription",
    "content"
  ]);
}

function youtubePlaylistTitleFromContext(context: AdapterContext): string | undefined {
  const items = context.raw.embeddedData.items.filter((item) => item.source === "youtubeInitialData");
  return findRendererText(items, ["playlistMetadataRenderer", "playlistHeaderRenderer"], ["title", "playlistTitle", "name"]);
}

function findRendererText(items: Array<{ data: JsonLdNode }>, rendererKeys: string[], textKeys: string[]): string | undefined {
  for (const item of items) {
    let found: string | undefined;

    walkData(item.data, (value, key) => {
      if (found || !key || !rendererKeys.includes(key) || !isRecord(value)) {
        return;
      }

      for (const textKey of textKeys) {
        found = stringFromUnknown(value[textKey]);
        if (found) {
          return;
        }
      }
    });

    if (found) {
      return found;
    }
  }

  return undefined;
}

function findYouTubeRendererForVideoId(items: Array<{ data: JsonLdNode }>, videoId: string, textKeys: string[]): string | undefined {
  for (const item of items) {
    let found: string | undefined;

    walkData(item.data, (value) => {
      if (found || !isRecord(value) || stringFromUnknown(value.videoId) !== videoId) {
        return;
      }

      for (const textKey of textKeys) {
        found = stringFromUnknown(value[textKey]);
        if (found) {
          return;
        }
      }
    });

    if (found) {
      return found;
    }
  }

  return undefined;
}

function findEmbeddedStringBySources(context: AdapterContext, sources: string[], keys: string[]): string | undefined {
  const candidates: string[] = [];

  for (const item of context.raw.embeddedData.items) {
    if (!sources.includes(item.source)) {
      continue;
    }

    walkData(item.data, (value, key) => {
      if (!key || !matchesKey(key, keys)) {
        return;
      }

      const text = stringFromUnknown(value);
      if (text) {
        candidates.push(text);
      }
    });
  }

  return bestTextCandidate(candidates);
}

function hasRedditJsonEndpointPayload(context: AdapterContext): boolean {
  return context.raw.embeddedData.items.some((item) => item.source === "applicationJson" && item.path === "metanova-reddit-json");
}

function valueAtPath(node: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), node);
}

function cleanYouTubeHtmlTitle(title: string | undefined): string | undefined {
  return title?.replace(/\s*-\s*YouTube\s*$/i, "").trim();
}

function titleFromContext(context: AdapterContext, embeddedKeys: string[]): string | undefined {
  return firstText(
    context.raw.openGraph.title,
    context.raw.twitter.title,
    findEmbeddedString(context, embeddedKeys),
    context.raw.html.title
  );
}

function descriptionFromContext(context: AdapterContext): string | undefined {
  return firstText(
    context.raw.openGraph.description,
    context.raw.twitter.description,
    findEmbeddedString(context, ["description", "desc", "summary", "excerpt", "caption", "text"]),
    context.raw.html.description
  );
}

function publishedTimeFromContext(context: AdapterContext): string | undefined {
  return firstText(
    context.raw.openGraph.article?.publishedTime,
    findJsonLdString(context.raw.jsonLd.nodes, ["datePublished", "uploadDate", "createdAt"]),
    findEmbeddedString(context, ["datePublished", "publishedTime", "published_at", "createdAt", "created_at", "uploadDate", "timestamp"])
  );
}

function mediaFromContext(context: AdapterContext): { images: MediaAsset[]; videos: MediaAsset[] } {
  const discovered = discoverMedia(context.raw, context.finalUrl);
  return {
    images: discovered.images,
    videos: discovered.videos
  };
}

function entityFromContext(context: AdapterContext, keys: string[]): Entity | undefined {
  const jsonLdEntity = entityFromJsonValue(findJsonLdValue(context.raw.jsonLd.nodes, keys));
  if (jsonLdEntity) {
    return jsonLdEntity;
  }

  for (const item of context.raw.embeddedData.items) {
    const entity = entityFromJsonValue(findValueByKeys(item.data, keys));
    if (entity) {
      return entity;
    }
  }

  return undefined;
}

function findEmbeddedString(context: AdapterContext, keys: string[]): string | undefined {
  const candidates: string[] = [];

  for (const item of context.raw.embeddedData.items) {
    walkData(item.data, (value, key) => {
      if (!key || !matchesKey(key, keys)) {
        return;
      }

      const text = stringFromUnknown(value);
      if (text) {
        candidates.push(text);
      }
    });
  }

  return bestTextCandidate(candidates);
}

function findJsonLdString(nodes: JsonLdNode[], keys: string[]): string | undefined {
  const value = findJsonLdValue(nodes, keys);
  return stringFromUnknown(value);
}

function findJsonLdValue(nodes: JsonLdNode[], keys: string[]): unknown {
  for (const node of nodes) {
    const value = findValueByKeys(node, keys);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function findValueByKeys(node: unknown, keys: string[]): unknown {
  let found: unknown;

  walkData(node, (value, key) => {
    if (found !== undefined || !key || !matchesKey(key, keys)) {
      return;
    }

    found = value;
  });

  return found;
}

function walkData(value: unknown, visit: (value: unknown, key?: string) => void, key?: string, depth = 0): void {
  if (depth > 8) {
    return;
  }

  visit(value, key);

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 250)) {
      walkData(item, visit, undefined, depth + 1);
    }
    return;
  }

  if (isRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value).slice(0, 500)) {
      walkData(childValue, visit, childKey, depth + 1);
    }
  }
}

function entityFromJsonValue(value: unknown): Entity | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return { name: value };
  }

  if (Array.isArray(value)) {
    return value.map(entityFromJsonValue).find(Boolean);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const name =
    stringFromUnknown(value.name) ??
    stringFromUnknown(value.username) ??
    stringFromUnknown(value.screen_name) ??
    stringFromUnknown(value.ownerChannelName) ??
    stringFromUnknown(value.title);

  if (!name) {
    return undefined;
  }

  return {
    name,
    url: stringFromUnknown(value.url) ?? stringFromUnknown(value.canonicalUrl),
    logo: stringFromUnknown(value.logo) ?? stringFromUnknown(value.avatar) ?? stringFromUnknown(value.image)
  };
}

function firstText(...values: Array<string | undefined>): string | undefined {
  return bestTextCandidate(values.filter((value): value is string => Boolean(value)));
}

function bestTextCandidate(values: string[]): string | undefined {
  return values
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 0)
    .sort((left, right) => scoreText(right) - scoreText(left))[0];
}

function scoreText(value: string): number {
  let score = Math.min(value.length, 180);
  if (value.length >= 10 && value.length <= 140) {
    score += 60;
  }
  if (/^(home|login|index|untitled)$/i.test(value)) {
    score -= 100;
  }
  return score;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    const values = value.map(stringFromUnknown).filter(Boolean);
    return values.length > 0 ? values.join("") : undefined;
  }

  if (isRecord(value)) {
    return (
      stringFromUnknown(value.text) ??
      stringFromUnknown(value.simpleText) ??
      stringFromUnknown(value.runs) ??
      stringFromUnknown(value.title) ??
      stringFromUnknown(value.name) ??
      stringFromUnknown(value.value) ??
      stringFromUnknown(value.url)
    );
  }

  return undefined;
}

function matchesKey(key: string, keys: string[]): boolean {
  const normalized = key.toLowerCase();
  return keys.some((candidate) => normalized === candidate.toLowerCase() || normalized.endsWith(candidate.toLowerCase()));
}

function isRecord(value: unknown): value is JsonLdNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface RedditUrlParts {
  isPost: boolean;
  subreddit?: string;
  postId?: string;
  username?: string;
}

function parseRedditUrl(url: URL): RedditUrlParts {
  const parts = url.pathname.split("/").filter(Boolean);
  const commentsIndex = parts.indexOf("comments");
  const shortPostId = hostMatches(url, ["redd.it"]) ? parts[0] : undefined;

  return {
    isPost: commentsIndex !== -1 || Boolean(shortPostId),
    subreddit: parts[0] === "r" ? parts[1] : undefined,
    postId: commentsIndex !== -1 ? parts[commentsIndex + 1] : shortPostId,
    username: parts[0] === "user" ? parts[1] : undefined
  };
}

function cleanSocialTitle(title: string | undefined): string | undefined {
  return title?.replace(/\s*:\s*r\/[A-Za-z0-9_]+$/i, "").trim();
}

function hostMatches(url: URL, domains: string[]): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function getYouTubeVideoId(url: URL): string | undefined {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0];
  }

  if (url.pathname === "/watch") {
    return url.searchParams.get("v") ?? undefined;
  }

  const embedMatch = url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
  return embedMatch?.[1];
}

function getYouTubePlaylistId(url: URL): string | undefined {
  return url.searchParams.get("list") ?? undefined;
}

function getYouTubeCommunityPostId(url: URL): string | undefined {
  return url.pathname.match(/\/post\/([^/?]+)/)?.[1];
}

function extractPlaylistVideos(context: AdapterContext): Array<{ id: string; title?: string; url: string }> {
  const videos = new Map<string, { id: string; title?: string; url: string }>();

  for (const item of context.raw.embeddedData.items) {
    walkData(item.data, (value) => {
      if (!isRecord(value)) {
        return;
      }

      const videoId =
        stringFromUnknown(value.videoId) ??
        stringFromUnknown(value.video_id) ??
        (isRecord(value.watchEndpoint) ? stringFromUnknown(value.watchEndpoint.videoId) : undefined) ??
        (isRecord(value.navigationEndpoint) && isRecord(value.navigationEndpoint.watchEndpoint)
          ? stringFromUnknown(value.navigationEndpoint.watchEndpoint.videoId)
          : undefined);

      if (!videoId || videos.has(videoId)) {
        return;
      }

      videos.set(videoId, {
        id: videoId,
        title: stringFromUnknown(value.title) ?? stringFromUnknown(value.headline) ?? stringFromUnknown(value.shortBylineText),
        url: `https://www.youtube.com/watch?v=${videoId}`
      });
    });
  }

  return [...videos.values()].slice(0, 100);
}

function arrayFromContext(context: AdapterContext, keys: string[]): string[] | undefined {
  const fromJsonLd = arrayOfStrings(findJsonLdValue(context.raw.jsonLd.nodes, keys));
  if (fromJsonLd) {
    return fromJsonLd;
  }

  for (const item of context.raw.embeddedData.items) {
    const embedded = arrayOfStrings(findValueByKeys(item.data, keys));
    if (embedded) {
      return embedded;
    }
  }

  return undefined;
}

function numberFromContext(context: AdapterContext, keys: string[]): number | undefined {
  const fromJsonLd = numberFromUnknown(findJsonLdValue(context.raw.jsonLd.nodes, keys));
  if (fromJsonLd !== undefined) {
    return fromJsonLd;
  }

  for (const item of context.raw.embeddedData.items) {
    const embedded = numberFromUnknown(findValueByKeys(item.data, keys));
    if (embedded !== undefined) {
      return embedded;
    }
  }

  return undefined;
}

function arrayOfStrings(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const values = value.map(stringFromUnknown).filter((item): item is string => Boolean(item));
    return values.length > 0 ? values : undefined;
  }

  const text = stringFromUnknown(value);
  if (!text) {
    return undefined;
  }

  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

function numberFromUnknown(value: unknown): number | undefined {
  const text = stringFromUnknown(value);
  if (!text) {
    return undefined;
  }

  const parsed = Number.parseInt(text.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactAdapterResult<T extends AdapterExtractionResult | PlatformRawData>(result: T): T {
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0))
  ) as T;
}
