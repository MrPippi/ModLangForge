import type { GuideFiles } from '@mlf/core';
import type { CatalogMod } from '@mlf/core/catalog';
import type { LoadedMod } from '@mlf/core/node';

/** /api/v1/mods/<id>.json 的內容；guide 為選填，version 維持 1 */
export interface ModApiBody {
  readonly version: 1;
  readonly meta: CatalogMod;
  readonly en_us: Readonly<Record<string, string>>;
  readonly zh_tw: Readonly<Record<string, string>>;
  readonly guide?: { readonly files: GuideFiles; readonly zh_tw: Readonly<Record<string, string>> };
}

/** 手冊只輸出原樣檔與譯文；英文由使用端自行攤平 */
export function toModApiBody(mod: Pick<LoadedMod, 'meta' | 'en' | 'zh' | 'guide'>): ModApiBody {
  return {
    version: 1,
    meta: mod.meta,
    en_us: mod.en,
    zh_tw: mod.zh,
    ...(mod.guide ? { guide: { files: mod.guide.files, zh_tw: mod.guide.zh } } : {}),
  };
}
