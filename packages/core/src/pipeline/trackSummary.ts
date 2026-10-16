import type { ApplyResult } from './applyVersion';
import type { Loader, TrackTarget } from './trackPlan';

export interface TrackEntry {
  readonly modId: string;
  readonly target: TrackTarget;
  readonly result: ApplyResult;
}

export interface TrackReport {
  readonly entries: readonly TrackEntry[];
  readonly skipped: readonly { readonly modId: string; readonly reason: string }[];
  readonly deferred: number;
}

const LOADER_NAMES: Readonly<Record<Loader, string>> = { forge: 'Forge', neoforge: 'NeoForge', fabric: 'Fabric', quilt: 'Quilt' };

const combo = (t: TrackTarget): string => `${t.mcVersion} ${LOADER_NAMES[t.loader]}`;
const versionCell = (t: TrackTarget): string =>
  t.kind === 'update' ? `${t.previous ?? '（未記錄）'} → ${t.version.version_number}` : `${t.version.version_number}（新增）`;

export function hasWrites(report: TrackReport): boolean {
  return report.entries.some((e) => e.result.kind === 'written');
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [`## ${title}`, '', ...lines, ''];
}

export function renderTrackSummary(report: TrackReport): string {
  const written = report.entries.flatMap((e) => (e.result.kind === 'written' ? [{ ...e, added: e.result.addedKeys }] : []));
  const conflicts = report.entries.flatMap((e) => (e.result.kind === 'conflict' ? [{ ...e, keys: e.result.conflicts.filter((c) => c.formatChanged).map((c) => c.key) }] : []));
  const errors = report.entries.flatMap((e) => (e.result.kind === 'error' ? [{ ...e, message: e.result.message }] : []));
  const counts = [
    `- 更新已收錄組合：${written.filter((w) => w.target.kind === 'update').length} 組`,
    `- 新增組合：${written.filter((w) => w.target.kind === 'add').length} 組`,
    `- 新增英文 key：${written.reduce((sum, w) => sum + w.added, 0)} 個`,
    `- 衝突未寫入：${conflicts.length} 組`,
    `- 錯誤：${errors.length} 組`,
    `- 超過上限、留到下次：${report.deferred} 組`,
  ];
  return [
    '## 摘要', '', ...counts, '',
    ...section('已寫入', written.length === 0 ? [] : ['| 模組 | 組合 | 版本 | 新增 key |', '|---|---|---|---|',
      ...written.map((w) => `| ${w.modId} | ${combo(w.target)} | ${versionCell(w.target)} | ${w.added} |`)]),
    ...section('衝突（未寫入，需人工處理）', conflicts.map((c) => `- ${c.modId} ${combo(c.target)} ${c.target.version.version_number}：${c.keys.map((k) => `\`${k}\``).join('、')}`)),
    ...section('錯誤', errors.map((e) => `- ${e.modId} ${combo(e.target)} ${e.target.version.version_number}：${e.message}`)),
    ...section('略過的模組', report.skipped.map((s) => `- ${s.modId}：${s.reason}`)),
  ].join('\n');
}
