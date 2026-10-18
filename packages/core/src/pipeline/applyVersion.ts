import type { CatalogMod, SourceVersion } from '../catalog/schema';
import type { KeyConflict } from './addSourceVersion';
import { planAddVersion, validateAddVersionArgs } from './addVersionPlan';
import type { ModrinthVersion } from './modrinth';
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
}

/** 讀寫模組資料與擷取 jar 英文語言檔；腳本提供真實實作，測試注入假實作 */
export interface ApplyVersionIO {
  readonly readMod: (modId: string) => Promise<ModFiles>;
  readonly writeMod: (modId: string, files: ModFiles) => Promise<void>;
  readonly extractEn: (version: ModrinthVersion, modId: string) => Promise<ExtractedEn>;
}

const HAS_ALNUM = /[a-z0-9]/i;

/**
 * 決定這個版本要收錄的原文。
 * 有 builtinPercent 的模組只收錄內建缺少的 key。
 * 其餘模組本站有整份翻譯：已收錄的 key 照舊保留（舊版仍需要本站譯文），
 * 新出現的 key 若 jar 內建繁中已涵蓋則不收錄，避免要人翻譯內建已有的文字。
 * 新出現的 key 若不含任何英數字（例如 "⚠⚠⚠"），或符合模組設定的排除前綴，一律不收錄。
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
    key in extracted.uncovered && HAS_ALNUM.test(key) && !excluded.some((prefix) => key.startsWith(prefix));
  return Object.fromEntries(Object.entries(base).filter(([key]) => key in en || acceptNew(key)));
}

export interface ApplyTarget {
  readonly mcVersion: string;
  readonly loader: Loader;
  readonly version: ModrinthVersion;
}

export type ApplyResult =
  | { readonly kind: 'written'; readonly addedKeys: number; readonly conflicts: readonly KeyConflict[]; readonly replaced: readonly SourceVersion[] }
  | { readonly kind: 'conflict'; readonly conflicts: readonly KeyConflict[] }
  | { readonly kind: 'error'; readonly message: string };

/** 把一個 Modrinth 版本併入模組資料；格式碼衝突時不寫入；任何例外轉為 error 結果 */
export async function applyVersion(io: ApplyVersionIO, modId: string, target: ApplyTarget, today: string): Promise<ApplyResult> {
  try {
    const { meta, en } = await io.readMod(modId);
    const argError = validateAddVersionArgs(meta, target.mcVersion);
    if (argError) return { kind: 'error', message: argError };
    const incoming = incomingFor(meta, en, await io.extractEn(target.version, modId));
    const ref = { modVersion: target.version.version_number, mcVersion: target.mcVersion, loader: target.loader };
    const plan = planAddVersion(meta, en, ref, incoming, today);
    if (plan.kind === 'refused') return { kind: 'conflict', conflicts: plan.conflicts };
    await io.writeMod(modId, { meta: plan.meta, en: plan.en });
    return { kind: 'written', addedKeys: plan.addedKeys.length, conflicts: plan.conflicts, replaced: plan.replaced };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
