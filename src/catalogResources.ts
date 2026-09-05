import defaults from './data/resourceCatalog.json';
import type { ItemResource } from './resources';

export function catalogResources(entry: {id: string}): ItemResource[] {
  return structuredClone((defaults as Record<string, ItemResource[]>)[entry.id.split('::loot-quality::')[0]] ?? []);
}
