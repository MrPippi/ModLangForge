import type { ModSummary } from '../lib/data';

export const ALL = '';

export function filterMods(mods: readonly ModSummary[], loader: string, version: string): ModSummary[] {
  return mods.filter(
    (m) => (loader === ALL || m.loaders.some((l) => l === loader)) && (version === ALL || m.mcVersions.includes(version)),
  );
}
