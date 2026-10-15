import { type CatalogMod, LOADERS, type SourceVersion, sourceVersionId } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import { checkFormat, extractTokens } from '../validate/formatCodes';

export type SourceRef = Omit<SourceVersion, 'missingKeys'>;

export interface VersionedSource {
  readonly en: Readonly<Record<string, string>>;
  readonly sourceVersions: readonly SourceVersion[];
}

export interface KeyConflict {
  readonly key: string;
  readonly existing: string;
  readonly incoming: string;
  /** 格式碼不同：沿用既有原文會讓某些版本的譯文參數錯位，需人工處理 */
  readonly formatChanged: boolean;
}

export interface AddVersionResult extends VersionedSource {
  readonly addedKeys: readonly string[];
  readonly conflicts: readonly KeyConflict[];
}

export class DuplicateSourceVersionError extends Error {}

const POSITIONAL_ARG = /^%\d+\$/;

/** 非位置式 printf 參數（%s、%d…）依出現順序對應呼叫參數，只要順序改變就會錯位 */
function argOrder(text: string): string {
  return extractTokens(text)
    .filter((t) => t.startsWith('%') && t !== '%%' && t !== '%n' && !POSITIONAL_ARG.test(t))
    .join(' ');
}

function formatChanged(existing: string, incoming: string): boolean {
  return checkFormat(existing, incoming) !== null || argOrder(existing) !== argOrder(incoming);
}

function findConflicts(en: Readonly<Record<string, string>>, incoming: Readonly<Record<string, string>>): KeyConflict[] {
  return Object.entries(incoming)
    .filter(([key, text]) => Object.hasOwn(en, key) && en[key] !== text)
    .map(([key, text]) => {
      const existing = en[key] ?? '';
      return { key, existing, incoming: text, formatChanged: formatChanged(existing, text) };
    });
}

/** 把新來源版本的 en_us 併入既有資料；既有原文優先，新 key 依序附加在最後 */
export function addSourceVersion(
  current: VersionedSource,
  ref: SourceRef,
  incoming: Readonly<Record<string, string>>,
): AddVersionResult {
  const id = sourceVersionId(ref);
  if (current.sourceVersions.some((v) => sourceVersionId(v) === id)) {
    throw new DuplicateSourceVersionError(`來源版本已存在：${id}`);
  }
  const addedKeys = Object.keys(incoming).filter((k) => !Object.hasOwn(current.en, k));
  const absent = Object.keys(current.en).filter((k) => !Object.hasOwn(incoming, k));
  return {
    en: { ...current.en, ...Object.fromEntries(addedKeys.map((k) => [k, incoming[k] ?? ''])) },
    sourceVersions: [
      ...current.sourceVersions.map((v) => ({ ...v, missingKeys: [...v.missingKeys, ...addedKeys] })),
      { ...ref, missingKeys: absent },
    ],
    addedKeys,
    conflicts: findConflicts(current.en, incoming),
  };
}

/** 依來源版本更新 mod.json：寫入 sourceVersions，並把 mcVersion／loader 併入支援清單 */
export function withSourceVersions(meta: CatalogMod, sourceVersions: readonly SourceVersion[], today: string): CatalogMod {
  const mc = new Set([...meta.mcVersions, ...sourceVersions.map((v) => v.mcVersion)]);
  const loaders = new Set([...meta.loaders, ...sourceVersions.map((v) => v.loader)]);
  return {
    ...meta,
    sourceVersions: [...sourceVersions],
    mcVersions: PACK_FORMATS.map((f) => f.mcVersion).filter((v) => mc.has(v)),
    loaders: LOADERS.filter((l) => loaders.has(l)),
    updatedAt: today,
  };
}
