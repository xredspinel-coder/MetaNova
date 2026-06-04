import type { CheerioAPI } from "cheerio";

export type MetadataType =
  | "website"
  | "article"
  | "image"
  | "product"
  | "video"
  | "playlist"
  | "audio"
  | "social_post"
  | "profile"
  | "app"
  | "unknown";

export type MediaKind = "image" | "video" | "audio" | "favicon";

export type MetadataSource =
  | "html"
  | "openGraph"
  | "twitter"
  | "jsonLd"
  | "oEmbed"
  | "adapter"
  | "plugin"
  | "fallback"
  | "favicon";

export interface MediaAsset {
  url: string;
  kind: MediaKind;
  source: MetadataSource | string;
  secureUrl?: string;
  type?: string;
  width?: number;
  height?: number;
  alt?: string;
  title?: string;
  poster?: string;
  score?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface Entity {
  name?: string;
  url?: string;
  logo?: string;
  sameAs?: string[];
}

export interface ArticleMetadata {
  headline?: string;
  section?: string;
  tags?: string[];
  publishedTime?: string;
  modifiedTime?: string;
  expirationTime?: string;
  authors?: Entity[];
  publisher?: Entity;
}

export interface ProductMetadata {
  name?: string;
  brand?: Entity;
  sku?: string;
  price?: string;
  currency?: string;
  availability?: string;
  condition?: string;
  ratingValue?: number;
  reviewCount?: number;
}

export interface ApplicationMetadata {
  name?: string;
  category?: string;
  operatingSystem?: string;
  price?: string;
  currency?: string;
}

export interface VideoMetadata {
  id?: string;
  title?: string;
  channel?: Entity;
  publishedTime?: string;
  duration?: string;
  tags?: string[];
  category?: string;
  viewCount?: number;
}

export interface PlaylistVideo {
  id: string;
  title?: string;
  url: string;
}

export interface PlaylistMetadata {
  id?: string;
  title?: string;
  channel?: Entity;
  videos: PlaylistVideo[];
}

export interface MetadataSourceAttribution {
  title?: string;
  description?: string;
  author?: string;
  image?: string;
}

export interface PreviewCard {
  title?: string;
  description?: string;
  image?: string;
  url: string;
  siteName?: string;
  domain?: string;
  author?: string;
  type: MetadataType;
  confidence: number;
}

export interface RedirectEntry {
  from: string;
  to: string;
  statusCode: number;
}

export interface ExtractionDiagnostics {
  originalUrl?: string;
  finalUrl?: string;
  canonicalUrl?: string;
  isShortUrl?: boolean;
  shortUrlProvider?: string;
  statusCode?: number;
  contentType?: string;
  redirects: RedirectEntry[];
  sourcesUsed: string[];
  warnings: string[];
  trace: string[];
  adapter?: {
    matched: boolean;
    name?: string;
    confidence?: number;
  };
  errors?: string[];
  selectedImageReason?: string;
  fetchDurationMs?: number;
  extractedAt: string;
}

export interface UnifiedMetadata {
  ok: boolean;
  url: string;
  finalUrl: string;
  type: MetadataType;
  title?: string;
  description?: string;
  siteName?: string;
  canonicalUrl?: string;
  confidence: number;
  completeness: number;
  reliability: number;
  bestImage?: string;
  images: MediaAsset[];
  videos: MediaAsset[];
  audio: MediaAsset[];
  favicons: MediaAsset[];
  article?: ArticleMetadata;
  product?: ProductMetadata;
  video?: VideoMetadata;
  playlist?: PlaylistMetadata;
  author?: Entity;
  publisher?: Entity;
  app?: ApplicationMetadata;
  sources?: MetadataSourceAttribution;
  raw?: RawMetadataSources;
  diagnostics: ExtractionDiagnostics;
  trace: string[];
}

export interface HtmlMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  robots?: string;
  canonicalUrl?: string;
  manifestUrl?: string;
  themeColor?: string;
  applicationName?: string;
  favicons: MediaAsset[];
  imageSrc?: MediaAsset;
  alternates: Array<{ href: string; type?: string; hreflang?: string; title?: string }>;
}

export interface OpenGraphMetadata {
  title?: string;
  description?: string;
  type?: string;
  url?: string;
  siteName?: string;
  locale?: string;
  determiner?: string;
  images: MediaAsset[];
  videos: MediaAsset[];
  audio: MediaAsset[];
  article?: ArticleMetadata;
  product?: ProductMetadata;
  raw: Record<string, string | string[]>;
}

export interface TwitterMetadata {
  card?: string;
  site?: string;
  creator?: string;
  title?: string;
  description?: string;
  images: MediaAsset[];
  videos: MediaAsset[];
  raw: Record<string, string | string[]>;
}

export type JsonLdNode = Record<string, unknown>;

export interface JsonLdMetadata {
  nodes: JsonLdNode[];
  warnings: string[];
}

export interface OEmbedLink {
  href: string;
  type?: string;
  title?: string;
}

export interface OEmbedData {
  type?: string;
  version?: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  html?: string;
  url?: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface OEmbedMetadata {
  links: OEmbedLink[];
  data: OEmbedData[];
}

export interface EmbeddedDataItem {
  source:
    | "nextData"
    | "nuxt"
    | "initialState"
    | "preloadedState"
    | "apollo"
    | "jsonScript"
    | "applicationJson"
    | "youtubeInitialData"
    | "youtubePlayerResponse";
  path?: string;
  data: JsonLdNode;
}

export interface EmbeddedDataMetadata {
  items: EmbeddedDataItem[];
  warnings: string[];
}

export interface AdapterExtractionResult {
  source: string;
  type?: MetadataType;
  title?: string;
  description?: string;
  siteName?: string;
  canonicalUrl?: string;
  images?: MediaAsset[];
  videos?: MediaAsset[];
  audio?: MediaAsset[];
  article?: Partial<ArticleMetadata>;
  product?: Partial<ProductMetadata>;
  video?: Partial<VideoMetadata>;
  playlist?: Partial<PlaylistMetadata>;
  app?: Partial<ApplicationMetadata>;
  author?: Entity;
  publisher?: Entity;
  raw?: Record<string, unknown>;
  warnings?: string[];
}

export type PluginExtractionResult = AdapterExtractionResult;

export interface RawMetadataSources {
  html: HtmlMetadata;
  openGraph: OpenGraphMetadata;
  twitter: TwitterMetadata;
  jsonLd: JsonLdMetadata;
  embeddedData: EmbeddedDataMetadata;
  oEmbed: OEmbedMetadata;
  images: MediaAsset[];
  videos: MediaAsset[];
  audio: MediaAsset[];
  adapters: AdapterExtractionResult[];
  plugins: PluginExtractionResult[];
}

export interface ExtractorContext {
  html: string;
  url: string;
  finalUrl: string;
  $: CheerioAPI;
  raw: RawMetadataSources;
  options: ParseMetadataOptions;
}

export type AdapterContext = ExtractorContext;

export type AdapterRawData = AdapterExtractionResult | Record<string, unknown>;

export interface SiteAdapter<TRawData extends AdapterRawData = AdapterExtractionResult> {
  name: string;
  detect?: (url: URL) => boolean;
  canHandle?: (url: URL) => boolean;
  extract(context: AdapterContext): TRawData | Promise<TRawData>;
  normalize?: (rawData: TRawData, context: AdapterContext) => AdapterExtractionResult | Promise<AdapterExtractionResult>;
}

export interface CustomExtractor {
  name: string;
  extract(context: ExtractorContext): PluginExtractionResult | Promise<PluginExtractionResult>;
}

export type ImageScorer = (image: MediaAsset, context: ImageScoringContext) => number;

export interface ImageScoringContext {
  index: number;
  images: MediaAsset[];
}

export interface MetaNovaPluginApi {
  addAdapter(adapter: SiteAdapter): void;
  addExtractor(name: string, extractor: CustomExtractor["extract"]): void;
  addImageScorer(scorer: ImageScorer): void;
}

export interface MetaNovaPlugin {
  name: string;
  setup(api: MetaNovaPluginApi): void;
}

export interface MetaNovaCacheEntry {
  html: string;
  finalUrl?: string;
  statusCode?: number;
  contentType?: string;
  redirects?: RedirectEntry[];
}

export interface MetaNovaCache {
  get(url: string): MetaNovaCacheEntry | undefined | Promise<MetaNovaCacheEntry | undefined>;
  set(url: string, entry: MetaNovaCacheEntry): void | Promise<void>;
}

export interface ParseMetadataOptions {
  includeRaw?: boolean;
  plugins?: MetaNovaPlugin[];
  adapters?: SiteAdapter[];
  imageScorers?: ImageScorer[];
}

export interface FetchMetadataOptions extends ParseMetadataOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  userAgent?: string;
  accept?: string;
  acceptLanguage?: string;
  acceptEncoding?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  cache?: MetaNovaCache;
  allowedProtocols?: string[];
  allowLocalhost?: boolean;
  allowPrivateNetwork?: boolean;
  fetchOEmbed?: boolean;
}
