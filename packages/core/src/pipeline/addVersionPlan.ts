import type { CatalogMod, SourceVersion } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import type { DetectedMod } from '../types';
import { addSourceVersion, type KeyConflict, type SourceRef, withSourceVersions } from './addSourceVersion';
import { JSON_LANG_MIN_PACK_FORMAT } from './modrinth';

export type AddVersionPlan =
  | { readonly kind: 'refused'; readonly conflicts: readonly KeyConflict[] }
  | {
      readonly kind: 'write';
      readonly meta: CatalogMod;
      readonly en: Readonly<Record<string, string>>;
      readonly addedKeys: readonly string[];
      readonly conflicts: readonly KeyConflict[];
      readonly replaced: readonly SourceVersion[];
    };

/** 在下載 jar 之前檢查參數；回傳錯誤訊息，合法時回傳 null */
export function validateAddVersionArgs(meta: Pick<CatalogMod, 'format'>, mcVersion: string): string | null {
  if (meta.format !== 'json') return '此模組使用 .lang 語言檔，add:version 只支援 JSON 語言檔';
  const pack = PACK_FORMATS.find((f) => f.mcVersion === mcVersion);
  if (!pack) return `不支援的 Minecraft 版本：${mcVersion}`;
  if (pack.packFormat < JSON_LANG_MIN_PACK_FORMAT) return `JSON 語言檔需要 Minecraft 1.13 以上：${mcVersion}`;
  return null;
}

/** 只接受與 modId 相同的 JSON 命名空間；不退回其他命名空間，避免誤併內嵌函式庫的語言檔 */
export function selectNamespace(mods: readonly DetectedMod[], modId: string): DetectedMod | undefined {
  return mods.find((m) => m.modId === modId && m.format === 'json');
}

/** 決定要寫入的內容；有格式碼衝突時拒絕，呼叫端不得寫入任何檔案 */
export function planAddVersion(
  meta: CatalogMod,
  en: Readonly<Record<string, string>>,
  ref: SourceRef,
  incoming: Readonly<Record<string, string>>,
  today: string,
): AddVersionPlan {
  const result = addSourceVersion({ en, sourceVersions: meta.sourceVersions }, ref, incoming);
  if (result.conflicts.some((c) => c.formatChanged)) return { kind: 'refused', conflicts: result.conflicts };
  return {
    kind: 'write',
    meta: withSourceVersions(meta, result.sourceVersions, today),
    en: result.en,
    addedKeys: result.addedKeys,
    conflicts: result.conflicts,
    replaced: result.replaced,
  };
}
