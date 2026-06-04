import { fetchMetadata } from "./fetchMetadata.js";
import { parseMetadata, parseMetadataAsync } from "./parse.js";
import { registerGlobalPlugin } from "./plugins/index.js";
import { createPreviewCard } from "./preview.js";
import type { FetchMetadataOptions, MetaNovaPlugin, ParseMetadataOptions, UnifiedMetadata } from "./types/index.js";

export interface MetaNovaRuntime {
  use(plugin: MetaNovaPlugin): MetaNovaRuntime;
  fetchMetadata(url: string, options?: FetchMetadataOptions): Promise<UnifiedMetadata>;
  parseMetadata(html: string, url: string, options?: ParseMetadataOptions): UnifiedMetadata;
  parseMetadataAsync(html: string, url: string, options?: ParseMetadataOptions): Promise<UnifiedMetadata>;
  createPreviewCard: typeof createPreviewCard;
}

export const MetaNova: MetaNovaRuntime = {
  use(plugin) {
    registerGlobalPlugin(plugin);
    return MetaNova;
  },
  fetchMetadata,
  parseMetadata,
  parseMetadataAsync,
  createPreviewCard
};
