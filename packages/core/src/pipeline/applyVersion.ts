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

/** 有 builtinPercent 的模組只收錄內建缺少的 key；其餘模組本站有整份翻譯，收錄全部原文 */
export function incomingFor(meta: CatalogMod, extracted: ExtractedEn): Readonly<Record<string, string>> {
  return meta.translation.builtinPercent === undefined ? extracted.all : extracted.uncovered;
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
    const incoming = incomingFor(meta, await io.extractEn(target.version, modId));
    const ref = { modVersion: target.version.version_number, mcVersion: target.mcVersion, loader: target.loader };
    const plan = planAddVersion(meta, en, ref, incoming, today);
    if (plan.kind === 'refused') return { kind: 'conflict', conflicts: plan.conflicts };
    await io.writeMod(modId, { meta: plan.meta, en: plan.en });
    return { kind: 'written', addedKeys: plan.addedKeys.length, conflicts: plan.conflicts, replaced: plan.replaced };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
