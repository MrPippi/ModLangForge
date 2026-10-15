import { DEFAULT_MC_VERSION, PACK_FORMATS } from '@mlf/core/export';

export interface VersionPick {
  readonly version: string;
  /** true 代表沒有共同版本，改用預設版本 */
  readonly fallback: boolean;
}

/** 依 PACK_FORMATS（新到舊）挑出所有清單都支援的最新版本 */
export function pickCommonVersion(lists: readonly (readonly string[])[]): VersionPick {
  if (lists.length === 0) return { version: DEFAULT_MC_VERSION, fallback: false };
  const common = PACK_FORMATS.find((f) => lists.every((list) => list.includes(f.mcVersion)));
  return common ? { version: common.mcVersion, fallback: false } : { version: DEFAULT_MC_VERSION, fallback: true };
}

/** 依新到舊排序，未知版本排在最後 */
export function sortVersions(versions: readonly string[]): string[] {
  const rank = (v: string) => {
    const i = PACK_FORMATS.findIndex((f) => f.mcVersion === v);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...new Set(versions)].sort((a, b) => rank(a) - rank(b));
}
