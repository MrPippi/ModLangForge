import { type CatalogMod, LOADERS, type SourceVersion, sourceVersionId } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import { extractTokens } from '../validate/formatCodes';

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
  /** 被新建置取代的同 MC 版本／載入器舊列（其所有 key 都在新建置或其他列裡時才取代） */
  readonly replaced: readonly SourceVersion[];
}

export class DuplicateSourceVersionError extends Error {}

const POSITIONAL_ARG = /^%(\d+)\$/;

/**
 * 參數簽章：每個 printf 參數對應的呼叫參數位置與型別，加上 MessageFormat 佔位符。
 * 非位置式參數（%s）依出現順序編號，因此 %s 與 %1$s 等價；§ 顏色碼與換行不影響參數對應，不列入。
 */
function argSignature(text: string): string {
  let next = 0;
  return extractTokens(text)
    .filter((t) => t.startsWith('{') || (t.startsWith('%') && t !== '%%' && t !== '%n'))
    .map((t) => {
      if (t.startsWith('{')) return t;
      const position = POSITIONAL_ARG.exec(t)?.[1] ?? String((next += 1));
      return `${position}:${t.slice(-1)}`;
    })
    .sort()
    .join(' ');
}

function formatChanged(existing: string, incoming: string): boolean {
  return argSignature(existing) !== argSignature(incoming);
}

function keysOf(v: SourceVersion, en: Readonly<Record<string, string>>): string[] {
  const missing = new Set(v.missingKeys);
  return Object.keys(en).filter((k) => !missing.has(k));
}

/**
 * 同 MC 版本與載入器的舊建置列中可刪除者：它的每個 key 都在新建置或其他保留列裡，刪除後不會產生孤兒 key。
 * 由舊到新逐列判斷，已決定刪除的列不再算作其他列的來源。
 */
function replaceableRows(
  current: VersionedSource,
  ref: SourceRef,
  incoming: Readonly<Record<string, string>>,
): SourceVersion[] {
  const rows = current.sourceVersions;
  const keySets = new Map(rows.map((v) => [v, new Set(keysOf(v, current.en))]));
  const sameCombo = rows.filter((v) => v.mcVersion === ref.mcVersion && v.loader === ref.loader);
  return sameCombo.reduce<SourceVersion[]>((removed, row) => {
    const others = rows.filter((v) => v !== row && !removed.includes(v));
    const covered = [...(keySets.get(row) ?? [])].every(
      (k) => Object.hasOwn(incoming, k) || others.some((v) => keySets.get(v)?.has(k)),
    );
    return covered ? [...removed, row] : removed;
  }, []);
}

/** 既有 key 的原文與新原文不同者；formatChanged 代表參數簽章改變（整合包 KubeJS 聯集也沿用） */
export function findKeyConflicts(en: Readonly<Record<string, string>>, incoming: Readonly<Record<string, string>>): KeyConflict[] {
  return Object.entries(incoming)
    .filter(([key, text]) => Object.hasOwn(en, key) && en[key] !== text)
    .map(([key, text]) => {
      const existing = en[key] ?? '';
      return { key, existing, incoming: text, formatChanged: formatChanged(existing, text) };
    });
}

/**
 * 把新來源版本的 en_us 併入既有資料；既有原文優先，新 key 依序附加在最後。
 * 同 MC 版本與載入器的舊建置，若它的 key 都在新建置或其他列裡，以新列取代；否則保留以免舊 key 失去來源。
 */
export function addSourceVersion(
  current: VersionedSource,
  ref: SourceRef,
  incoming: Readonly<Record<string, string>>,
): AddVersionResult {
  const id = sourceVersionId(ref);
  if (current.sourceVersions.some((v) => sourceVersionId(v) === id)) {
    throw new DuplicateSourceVersionError(`來源版本已存在：${id}`);
  }
  const replaced = replaceableRows(current, ref, incoming);
  const kept = current.sourceVersions.filter((v) => !replaced.includes(v));
  const addedKeys = Object.keys(incoming).filter((k) => !Object.hasOwn(current.en, k));
  const absent = Object.keys(current.en).filter((k) => !Object.hasOwn(incoming, k));
  return {
    en: { ...current.en, ...Object.fromEntries(addedKeys.map((k) => [k, incoming[k] ?? ''])) },
    sourceVersions: [
      ...kept.map((v) => ({ ...v, missingKeys: [...v.missingKeys, ...addedKeys] })),
      { ...ref, missingKeys: absent },
    ],
    addedKeys,
    conflicts: findKeyConflicts(current.en, incoming),
    replaced,
  };
}

const KNOWN_MC = PACK_FORMATS.map((f) => f.mcVersion);
const mcRank = (mc: string): number => {
  const i = KNOWN_MC.indexOf(mc);
  return i === -1 ? KNOWN_MC.length : i;
};

/**
 * 依來源版本更新 mod.json：寫入 sourceVersions，並把 mcVersion／loader 併入支援清單。
 * sourceVersions 依 MC 版本新到舊排列；同一 MC 版本內維持原順序，因此每個組合的最後一列仍是最新版，同一建置的各載入器也維持相鄰。
 */
export function withSourceVersions(meta: CatalogMod, sourceVersions: readonly SourceVersion[], today: string): CatalogMod {
  const mc = new Set([...meta.mcVersions, ...sourceVersions.map((v) => v.mcVersion)]);
  const loaders = new Set([...meta.loaders, ...sourceVersions.map((v) => v.loader)]);
  return {
    ...meta,
    sourceVersions: sourceVersions.toSorted((a, b) => mcRank(a.mcVersion) - mcRank(b.mcVersion)),
    mcVersions: KNOWN_MC.filter((v) => mc.has(v)),
    loaders: LOADERS.filter((l) => loaders.has(l)),
    updatedAt: today,
  };
}
