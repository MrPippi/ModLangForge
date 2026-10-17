import type { CatalogModpack, ModpackPlatform } from '../modpack/schema';
import type { KubejsEnglish } from './archive';
import { importFromCurseforge, type LocalFile } from './curseforge';
import type { FetchLike } from './http';
import { importFromModrinth } from './modrinth';
import { type ExistingModpack, type ImportedModpack, modpackIdFromSlug, type NamespaceChange, type NamespacedConflict, planModpackWrite } from './plan';

export const CURSEFORGE_KEY_ENV = 'CURSEFORGE_API_KEY';

export const MISSING_KEY_MESSAGE = [
  `未設定 ${CURSEFORGE_KEY_ENV}，無法使用 CurseForge API。`,
  '1. 到 https://console.curseforge.com/ 申請 API 金鑰。',
  `2. 在專案根目錄的 .env 加入一行 ${CURSEFORGE_KEY_ENV}=<你的金鑰>（.env 不會被提交），或設定同名環境變數後重新執行。`,
].join('\n');

const REDACTED = '[已隱藏]';

export interface AddModpackArgs {
  readonly platform: ModpackPlatform;
  /** slug 或專案 ID */
  readonly ref: string;
  readonly version?: string;
  /** 只用於 CurseForge：手動下載的整合包 zip */
  readonly filePath?: string;
}

/** 寫入 data/modpacks/<id>/ 的內容；不含 zh_tw.json */
export interface ModpackFiles {
  readonly meta: CatalogModpack;
  /** 只含需要寫入的命名空間 */
  readonly kubejsEn: KubejsEnglish;
}

/** 腳本提供真實實作，測試注入假實作 */
export interface AddModpackIO {
  readonly fetch: FetchLike;
  /** CURSEFORGE_API_KEY；只在記憶體中使用，不寫入、不印出 */
  readonly apiKey: string | undefined;
  readonly readLocalFile: (path: string) => Promise<Uint8Array>;
  readonly readExisting: (id: string) => Promise<ExistingModpack | null>;
  readonly write: (id: string, files: ModpackFiles) => Promise<void>;
}

export type AddModpackResult =
  | { readonly kind: 'written'; readonly id: string; readonly created: boolean; readonly changes: readonly NamespaceChange[]; readonly notes: readonly string[] }
  | { readonly kind: 'conflict'; readonly id: string; readonly conflicts: readonly NamespacedConflict[] }
  | { readonly kind: 'error'; readonly message: string };

function redact(message: string, secret: string | undefined): string {
  return secret ? message.split(secret).join(REDACTED) : message;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

async function importPack(io: AddModpackIO, args: AddModpackArgs, apiKey: string): Promise<ImportedModpack> {
  if (args.platform === 'modrinth') return importFromModrinth(io.fetch, { ref: args.ref, version: args.version });
  const localFile: LocalFile | undefined = args.filePath === undefined
    ? undefined
    : { name: fileName(args.filePath), bytes: await io.readLocalFile(args.filePath) };
  return importFromCurseforge(io.fetch, { ref: args.ref, apiKey, version: args.version, localFile });
}

/** 新增或更新一個整合包；格式碼衝突時不寫入任何檔案 */
export async function runAddModpack(io: AddModpackIO, args: AddModpackArgs, today: string): Promise<AddModpackResult> {
  if (args.platform === 'modrinth' && args.filePath !== undefined) return { kind: 'error', message: '--file 只能搭配 --curseforge 使用' };
  const apiKey = io.apiKey ?? '';
  if (args.platform === 'curseforge' && apiKey === '') return { kind: 'error', message: MISSING_KEY_MESSAGE };
  try {
    const incoming = await importPack(io, args, apiKey);
    const id = modpackIdFromSlug(incoming.slug);
    if (!id) return { kind: 'error', message: `整合包 slug「${incoming.slug}」不能當作 id（只能包含 a-z 0-9 _ . -，且不可為 index）` };
    const existing = await io.readExisting(id);
    const plan = planModpackWrite(id, existing, incoming, today);
    if (plan.kind === 'refused') return { kind: 'conflict', id, conflicts: plan.conflicts };
    await io.write(id, { meta: plan.meta, kubejsEn: plan.kubejsEn });
    return { kind: 'written', id, created: existing === null, changes: plan.changes, notes: incoming.notes };
  } catch (err) {
    return { kind: 'error', message: redact(err instanceof Error ? err.message : String(err), io.apiKey) };
  }
}
