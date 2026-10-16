// packages/core/src/review/applyMod.ts
import { validateModData } from '../catalog/validateMod';
import { parseJsonLang } from '../lang/parseJson';
import { serializeLang } from '../lang/serialize';
import type { ParsedLang } from '../lang/types';
import { mergeContributors } from './contributors';
import { PublishValidationError, type ApprovedChange, type ChangeOutcome, type ChangeResult, type ModFiles, type PublishFile, type StatusChange } from './publishTypes';

export interface ModApplyInput {
  readonly modId: string;
  readonly files: ModFiles;
  /** 已經 pickWinners 篩選過 */
  readonly changes: readonly ApprovedChange[];
  readonly status: StatusChange | null;
  readonly today: string;
}

export interface ModApplyResult {
  readonly files: PublishFile[];
  readonly results: ChangeResult[];
  readonly appliedCount: number;
  readonly credits: (string | null)[];
}

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const ownString = (rec: Readonly<Record<string, string>>, key: string): string | null => (Object.hasOwn(rec, key) ? rec[key] ?? null : null);

function parseFiles(modId: string, files: ModFiles): { en: ParsedLang; zh: ParsedLang; meta: Json } {
  try {
    const meta: unknown = JSON.parse(files.meta);
    if (!isRecord(meta)) throw new Error('mod.json 頂層必須是物件');
    return { en: parseJsonLang(files.en), zh: parseJsonLang(files.zh), meta };
  } catch (err) {
    throw new PublishValidationError(modId, [err instanceof Error ? err.message : String(err)]);
  }
}

function outcomeFor(c: ApprovedChange, en: ParsedLang, zh: ParsedLang): ChangeOutcome {
  if (ownString(en.entries, c.key) === null) return 'conflict';
  const current = ownString(zh.entries, c.key);
  if (current === c.proposed) return 'superseded';
  return current === c.baseTarget ? 'applied' : 'conflict';
}

/** 依 en_us 原始順序輸出；不在 en_us 的既有 key 依原順序附在最後 */
function buildZh(en: ParsedLang, zh: ParsedLang, overrides: ReadonlyMap<string, string>): string {
  const enKeys = new Set(en.order);
  const valueOf = (k: string): string => overrides.get(k) ?? ownString(zh.entries, k) ?? '';
  const ordered = en.order.filter((k) => overrides.has(k) || ownString(zh.entries, k) !== null).map((k) => [k, valueOf(k)] as const);
  const extras = zh.order.filter((k) => !enKeys.has(k)).map((k) => [k, valueOf(k)] as const);
  return serializeLang([...ordered, ...extras], 'json');
}

function updateMeta(meta: Json, credits: readonly (string | null)[], status: StatusChange | null, today: string): Json {
  const translation = isRecord(meta.translation) ? meta.translation : {};
  const existing = Array.isArray(translation.contributors) ? translation.contributors.filter((x): x is string => typeof x === 'string') : [];
  return {
    ...meta,
    translation: { ...translation, ...(status ? { status: status.status } : {}), contributors: mergeContributors(existing, credits) },
    updatedAt: today,
  };
}

function assertValid(modId: string, meta: Json, en: ParsedLang, zhText: string): void {
  const issues = validateModData(modId, meta, en.entries, JSON.parse(zhText)).filter((i) => i.level === 'error');
  if (issues.length > 0) throw new PublishValidationError(modId, issues.map((i) => `${i.file}${i.key ? `:${i.key}` : ''} ${i.message}`));
}

export function applyToMod(input: ModApplyInput): ModApplyResult {
  const { en, zh, meta } = parseFiles(input.modId, input.files);
  const results = input.changes.map((c) => ({ id: c.id, outcome: outcomeFor(c, en, zh) }));
  const applied = input.changes.filter((_, i) => results[i]?.outcome === 'applied');
  if (applied.length === 0 && !input.status) return { files: [], results, appliedCount: 0, credits: [] };

  const credits = applied.map((c) => c.creditName);
  const newMeta = updateMeta(meta, credits, input.status, input.today);
  const zhText = applied.length > 0 ? buildZh(en, zh, new Map(applied.map((c) => [c.key, c.proposed]))) : input.files.zh;
  assertValid(input.modId, newMeta, en, zhText);
  const dir = `data/mods/${input.modId}`;
  const candidates: (PublishFile & { readonly before: string })[] = [
    { path: `${dir}/zh_tw.json`, content: zhText, before: input.files.zh },
    { path: `${dir}/mod.json`, content: `${JSON.stringify(newMeta, null, 2)}
`, before: input.files.meta },
  ];
  // 內容與原文相同的檔案不輸出，避免空 commit
  const files: PublishFile[] = candidates.filter((f) => f.content !== f.before).map(({ path, content }) => ({ path, content }));
  return { files, results, appliedCount: applied.length, credits };
}
