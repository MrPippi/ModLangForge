import { DEFAULT_MC_VERSION, PACK_FORMATS, PREFERRED_MC_VERSIONS } from '@mlf/core/export';

export interface VersionPick {
  readonly version: string;
  /** true 代表沒有共同版本，改用預設版本 */
  readonly fallback: boolean;
}

/** 預設下載版本：優先 PREFERRED_MC_VERSIONS 中清單有的第一個，否則取清單中最新的（sorted 為新到舊） */
export function pickDefaultVersion(sorted: readonly string[]): string {
  return PREFERRED_MC_VERSIONS.find((v) => sorted.includes(v)) ?? sorted[0] ?? '';
}

/** 挑出所有清單都支援的預設版本：優先 PREFERRED_MC_VERSIONS，否則取最新（依 PACK_FORMATS 新到舊） */
export function pickCommonVersion(lists: readonly (readonly string[])[]): VersionPick {
  if (lists.length === 0) return { version: DEFAULT_MC_VERSION, fallback: false };
  const shared = PACK_FORMATS.map((f) => f.mcVersion).filter((v) => lists.every((list) => list.includes(v)));
  const common = pickDefaultVersion(shared);
  return common ? { version: common, fallback: false } : { version: DEFAULT_MC_VERSION, fallback: true };
}

/** 依新到舊排序，未知版本排在最後 */
export function sortVersions(versions: readonly string[]): string[] {
  const rank = (v: string) => {
    const i = PACK_FORMATS.findIndex((f) => f.mcVersion === v);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...new Set(versions)].sort((a, b) => rank(a) - rank(b));
}

/** 版本範圍文字，例如「1.20.1–1.21.1」；只有一個版本時直接回傳該版本 */
export function versionRange(versions: readonly string[]): string {
  const sorted = sortVersions(versions);
  if (sorted.length <= 1) return sorted[0] ?? '';
  return `${sorted[sorted.length - 1]}–${sorted[0]}`;
}
