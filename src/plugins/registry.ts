import type {
  CustomExtractor,
  ImageScorer,
  MetaNovaPlugin,
  MetaNovaPluginApi,
  ParseMetadataOptions,
  SiteAdapter
} from "../types/index.js";
import { defaultAdapters } from "../adapters/siteAdapters.js";

export interface MetaNovaRegistry {
  adapters: SiteAdapter[];
  extractors: CustomExtractor[];
  imageScorers: ImageScorer[];
}

const globalPlugins: MetaNovaPlugin[] = [];

export function registerGlobalPlugin(plugin: MetaNovaPlugin): void {
  if (!globalPlugins.some((registered) => registered.name === plugin.name)) {
    globalPlugins.push(plugin);
  }
}

export function createRegistry(options: ParseMetadataOptions = {}): MetaNovaRegistry {
  const registry: MetaNovaRegistry = {
    adapters: [...defaultAdapters, ...(options.adapters ?? [])],
    extractors: [],
    imageScorers: [...(options.imageScorers ?? [])]
  };

  const api: MetaNovaPluginApi = {
    addAdapter(adapter) {
      registry.adapters.push(adapter);
    },
    addExtractor(name, extractor) {
      registry.extractors.push({ name, extract: extractor });
    },
    addImageScorer(scorer) {
      registry.imageScorers.push(scorer);
    }
  };

  for (const plugin of [...globalPlugins, ...(options.plugins ?? [])]) {
    plugin.setup(api);
  }

  return registry;
}
