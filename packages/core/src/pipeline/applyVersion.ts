import type { CatalogMod, SourceVersion } from '../catalog/schema';
import type { KeyConflict } from './addSourceVersion';
import { planAddVersion, validateAddVersionArgs } from './addVersionPlan';
import { loaderPreference, type PlatformBuild } from './build';
import type { Loader } from './trackPlan';

export interface ModFiles {
  readonly meta: CatalogMod;
  readonly en: Readonly<Record<string, string>>;
}

/** 從 jar 擷取的英文語言檔 */
export interface ExtractedEn {
  /** jar 內全部原文 */
  readonly all: Readonly<Record<string, string>>;
  /** 扣除 jar 內建繁中已涵蓋的 key */
  readonly uncovered: Readonly<Record<string, string>>;
  /** jar 內建繁中涵蓋率；jar 沒有 zh_tw 時省略 */
  readonly builtinPercent?: number;
}

/** 讀寫模組資料與擷取 jar 英文語言檔；腳本提供真實實作，測試注入假實作 */
export interface ApplyVersionIO {
  readonly readMod: (modId: string) => Promise<ModFiles>;
  readonly writeMod: (modId: string, files: ModFiles) => Promise<void>;
  readonly extractEn: (build: PlatformBuild, modId: string) => Promise<ExtractedEn>;
}

const HAS_ALNUM = /[a-z0-9]/i;
/** JSON 語言檔裡當註解用的 key（__comment_file、_comment、// Common）；單一底線開頭的一般 key（例如 Quark 的 _quark.）不算 */
const COMMENT_KEY = /^(?:__|_comment|\/\/)/i;

/**
 * 決定這個版本要收錄的原文。
 * 有 builtinPercent 的模組只收錄內建缺少的 key。
 * 其餘模組本站有整份翻譯：已收錄的 key 照舊保留（舊版仍需要本站譯文），
 * 新出現的 key 若 jar 內建繁中已涵蓋則不收錄，避免要人翻譯內建已有的文字。
 * 新出現的 key 若不含任何英數字（例如 "⚠⚠⚠"）、是 JSON 註解（例如 __comment、_comment、// 開頭）、原文是空字串，
 * 或符合模組設定的排除前綴，一律不收錄。
 */
export function incomingFor(
  meta: CatalogMod,
  en: Readonly<Record<string, string>>,
  extracted: ExtractedEn,
): Readonly<Record<string, string>> {
  const builtin = meta.translation.builtinPercent !== undefined;
  const base = builtin ? extracted.uncovered : extracted.all;
  const excluded = meta.excludeKeyPrefixes ?? [];
  const acceptNew = (key: string): boolean =>
    key in extracted.uncovered
    && HAS_ALNUM.test(key)
    && !COMMENT_KEY.test(key)
    && (extracted.uncovered[key] ?? '').trim() !== ''
    && !excluded.some((prefix) => key.startsWith(prefix));
  return Object.fromEntries(Object.entries(base).filter(([key]) => key in en || acceptNew(key)));
}

export interface ApplyTarget {
  readonly mcVersion: string;
  readonly loader: Loader;
  readonly version: PlatformBuild;
}

export type ApplyResult =
  | { readonly kind: 'written'; readonly addedKeys: number; readonly conflicts: readonly KeyConflict[]; readonly replaced: readonly SourceVersion[] }
  | { readonly kind: 'conflict'; readonly conflicts: readonly KeyConflict[] }
  | { readonly kind: 'error'; readonly message: string };

/** 最新 MC 版本有收錄的載入器中最優先的一個；各載入器的 jar 內建繁中可能不同，只看這一個以免數字隨處理順序跳動 */
function primaryLoader(meta: CatalogMod, mcVersion: string): string | undefined {
  const loaders = new Set(meta.sourceVersions.filter((v) => v.mcVersion === mcVersion).map((v) => v.loader));
  return loaderPreference(mcVersion).find((l) => loaders.has(l));
}

/**
 * 內建繁中涵蓋率以最新 MC 版本、最優先載入器的建置為準；只更新原本就有 builtinPercent 的模組，
 * 不替靠本站整份翻譯的模組加上這個欄位（它同時決定收錄方式）。
 */
function withLatestBuiltinPercent(meta: CatalogMod, target: ApplyTarget, builtinPercent: number | undefined): CatalogMod {
  const current = meta.translation.builtinPercent;
  if (current === undefined || builtinPercent === undefined || builtinPercent === current) return meta;
  // withSourceVersions 依 PACK_FORMATS（由新到舊）排序 mcVersions，第一個即最新版
  if (meta.mcVersions[0] !== target.mcVersion || primaryLoader(meta, target.mcVersion) !== target.loader) return meta;
  return { ...meta, translation: { ...meta.translation, builtinPercent } };
}

/** 把一個平台版本併入模組資料；格式碼衝突時不寫入；任何例外轉為 error 結果 */
export async function applyVersion(io: ApplyVersionIO, modId: string, target: ApplyTarget, today: string): Promise<ApplyResult> {
  try {
    const { meta, en } = await io.readMod(modId);
    const argError = validateAddVersionArgs(meta, target.mcVersion);
    if (argError) return { kind: 'error', message: argError };
    const extracted = await io.extractEn(target.version, modId);
    const incoming = incomingFor(meta, en, extracted);
    const ref = { modVersion: target.version.modVersion, mcVersion: target.mcVersion, loader: target.loader };
    const plan = planAddVersion(meta, en, ref, incoming, today);
    if (plan.kind === 'refused') return { kind: 'conflict', conflicts: plan.conflicts };
    await io.writeMod(modId, { meta: withLatestBuiltinPercent(plan.meta, target, extracted.builtinPercent), en: plan.en });
    return { kind: 'written', addedKeys: plan.addedKeys.length, conflicts: plan.conflicts, replaced: plan.replaced };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
