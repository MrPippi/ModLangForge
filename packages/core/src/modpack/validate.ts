import { langIssues, translationKeyIssues } from '../catalog/validateMod';
import { supportsQuestLang } from '../ftbquests/schema';
import type { GlossaryTerm } from '../glossary/schema';
import { type CatalogModpack, catalogModpackSchema, isValidNamespace } from './schema';

export const MODPACK_FILE = 'modpack.json';
export const KUBEJS_DIR = 'kubejs';
export const KUBEJS_EN_FILE = 'en_us.json';
export const KUBEJS_ZH_FILE = 'zh_tw.json';

export interface ModpackIssue {
  readonly level: 'error' | 'warning';
  /** 相對整合包資料夾的路徑 */
  readonly file: 'modpack.json' | `kubejs/${string}` | `ftbquests/${string}`;
  readonly key?: string;
  readonly message: string;
}

export function kubejsFile(ns: string, name: string): ModpackIssue['file'] {
  return `kubejs/${ns}/${name}`;
}

/** ftbquests.status 必須與 Minecraft 版本一致 */
function questVersionIssues(meta: CatalogModpack): ModpackIssue[] {
  const status = meta.ftbquests?.status;
  const supported = supportsQuestLang(meta.source.mcVersion);
  if (status === 'supported' && !supported) {
    return [{ level: 'error', file: MODPACK_FILE, message: 'ftbquests 為 supported 時，source.mcVersion 必須是 1.21 以上' }];
  }
  if (status === 'unsupported-version' && supported) {
    return [{ level: 'error', file: MODPACK_FILE, message: 'ftbquests 為 unsupported-version 時，source.mcVersion 必須低於 1.21' }];
  }
  return [];
}

/** 驗證 modpack.json；dirName 為資料夾名稱 */
export function validateModpackMeta(dirName: string, raw: unknown): ModpackIssue[] {
  const parsed = catalogModpackSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((i): ModpackIssue => ({
      level: 'error',
      file: MODPACK_FILE,
      message: `${i.path.join('.') || '(root)'}：${i.message}`,
    }));
  }
  if (parsed.data.id !== dirName) {
    return [{ level: 'error', file: MODPACK_FILE, message: `id「${parsed.data.id}」與資料夾名稱「${dirName}」不一致` }];
  }
  return questVersionIssues(parsed.data);
}

/** 驗證一個 KubeJS 命名空間；zh 為 zh_tw.json 的內容（不存在時傳 {}）；回傳空陣列代表完全合法 */
export function validateKubejsData(ns: string, en: unknown, zh: unknown, terms: readonly GlossaryTerm[] = []): ModpackIssue[] {
  if (!isValidNamespace(ns)) {
    return [{ level: 'error', file: `kubejs/${ns}`, message: '命名空間只能包含 a-z 0-9 _ . -，且不可為 . 或 ..' }];
  }
  const zhFile = kubejsFile(ns, KUBEJS_ZH_FILE);
  const base: ModpackIssue[] = [...langIssues(kubejsFile(ns, KUBEJS_EN_FILE), en), ...langIssues(zhFile, zh)];
  if (base.some((i) => i.level === 'error')) return base;
  return translationKeyIssues(en as Record<string, string>, zh as Record<string, string>, terms).map((i): ModpackIssue => ({ ...i, file: zhFile }));
}
