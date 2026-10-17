import { catalogModSchema } from '../catalog/schema';
import { parseOrThrow } from '../modpackImport/errors';
import type { FetchLike } from '../modpackImport/http';
import { MISSING_KEY_MESSAGE, redact } from '../modpackImport/run';
import { modrinthSlug } from '../pipeline/modrinth';
import { findCurseforgeLink } from './lookup';
import type { LinkCandidate, LinkTarget, ReviewReason } from './match';
import { withCurseforgeLink } from './metaLinks';
import { REVIEW_REASON_TEXT } from './report';

/** 腳本傳入全域 fetch 與 CURSEFORGE_API_KEY；金鑰只在記憶體中使用，不寫入、不印出 */
export interface CurseforgeLinkIO {
  readonly fetch: FetchLike;
  readonly apiKey: string | undefined;
}

/** 腳本提供 data/mods 的讀寫，測試注入記憶體實作 */
export interface BackfillIO extends CurseforgeLinkIO {
  readonly listMods: () => Promise<readonly string[]>;
  /** data/mods/<modId>/mod.json 解析後的原始值（未驗證） */
  readonly readMod: (modId: string) => Promise<unknown>;
  readonly writeMod: (modId: string, meta: Readonly<Record<string, unknown>>) => Promise<void>;
}

export interface BackfillArgs {
  readonly dryRun: boolean;
  readonly modId?: string;
}

export type BackfillEntry =
  | { readonly kind: 'written'; readonly modId: string; readonly url: string; readonly via: 'slug' | 'name' }
  | { readonly kind: 'review'; readonly modId: string; readonly name: string; readonly reason: ReviewReason; readonly candidates: readonly LinkCandidate[] }
  | { readonly kind: 'failed'; readonly modId: string; readonly message: string }
  | { readonly kind: 'skipped'; readonly modId: string };

export interface BackfillDone {
  readonly kind: 'done';
  readonly dryRun: boolean;
  readonly entries: readonly BackfillEntry[];
}

export type BackfillResult = { readonly kind: 'error'; readonly message: string } | BackfillDone;

function errorText(err: unknown, apiKey: string): string {
  return redact(err instanceof Error ? err.message : String(err), apiKey);
}

async function backfillOne(io: BackfillIO, apiKey: string, modId: string, dryRun: boolean): Promise<BackfillEntry> {
  try {
    const raw = await io.readMod(modId);
    const meta = parseOrThrow(catalogModSchema, raw, `${modId}/mod.json`);
    if (meta.links.curseforge !== undefined) return { kind: 'skipped', modId };
    const match = await findCurseforgeLink(io.fetch, apiKey, { slug: modrinthSlug(meta.links.modrinth), name: meta.name });
    if (match.kind === 'review') return { kind: 'review', modId, name: meta.name, reason: match.reason, candidates: match.candidates };
    // 已通過 catalogModSchema，raw 必為物件；寫回原始物件以保留欄位順序與格式
    if (!dryRun) await io.writeMod(modId, withCurseforgeLink(raw as Readonly<Record<string, unknown>>, match.url));
    return { kind: 'written', modId, url: match.url, via: match.via };
  } catch (err) {
    return { kind: 'failed', modId, message: errorText(err, apiKey) };
  }
}

/** --mod 只接受 data/mods 既有的資料夾名稱；找不到時回傳 null */
async function selectMods(io: BackfillIO, modId: string | undefined): Promise<readonly string[] | null> {
  const all = [...(await io.listMods())].sort();
  if (modId === undefined) return all;
  return all.includes(modId) ? [modId] : null;
}

/** 為缺少 links.curseforge 的模組依序查詢並寫入；單一模組失敗不影響其他模組 */
export async function runCurseforgeBackfill(io: BackfillIO, args: BackfillArgs): Promise<BackfillResult> {
  const apiKey = io.apiKey ?? '';
  if (apiKey === '') return { kind: 'error', message: MISSING_KEY_MESSAGE };
  const mods = await selectMods(io, args.modId);
  if (mods === null) return { kind: 'error', message: `data/mods 沒有模組 ${args.modId ?? ''}` };
  const entries: BackfillEntry[] = [];
  for (const modId of mods) entries.push(await backfillOne(io, apiKey, modId, args.dryRun));
  return { kind: 'done', dryRun: args.dryRun, entries };
}

export interface DraftLink {
  readonly meta: Readonly<Record<string, unknown>>;
  /** 附在 fetch:modrinth 該行輸出的說明；沒有金鑰時為 null */
  readonly note: string | null;
}

/** fetch:modrinth 新增模組時使用：沒有金鑰不查詢、原樣回傳；查詢失敗或需要人工確認時也原樣回傳並附說明 */
export async function draftCurseforgeLink(io: CurseforgeLinkIO, meta: Readonly<Record<string, unknown>>, target: LinkTarget): Promise<DraftLink> {
  const apiKey = io.apiKey ?? '';
  if (apiKey === '') return { meta, note: null };
  try {
    const match = await findCurseforgeLink(io.fetch, apiKey, target);
    return match.kind === 'matched'
      ? { meta: withCurseforgeLink(meta, match.url), note: `CurseForge 連結：${match.slug}` }
      : { meta, note: `CurseForge 連結需要人工確認：${REVIEW_REASON_TEXT[match.reason]}` };
  } catch (err) {
    return { meta, note: `CurseForge 查詢失敗：${errorText(err, apiKey)}` };
  }
}
