import type { ModpackTrackReport, ModpackUpdate } from './track';

export const NO_UPDATES_LINE = '沒有整合包需要更新。';

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [`## ${title}`, '', ...lines, ''];
}

/** 表格儲存格不可含 |；清單項目不可換行 */
const cell = (text: string): string => text.replaceAll('|', '\\|');
const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, ' ');
const change = (before: string | number, after: string | number): string => (before === after ? `${after}` : `${before} → ${after}`);

function updateRow(u: ModpackUpdate): string {
  return [
    `${cell(u.name)}（${u.id}）`, `${cell(u.from.version)} → ${cell(u.to.version)}`, change(u.from.mcVersion, u.to.mcVersion),
    change(u.modsBefore, u.modsAfter), `${u.kubejsAddedKeys}`, `${u.questAddedKeys}`,
  ].reduce((row, c) => `${row} ${c} |`, '|');
}

export function renderModpackTrackSummary(report: ModpackTrackReport): string {
  const updated = report.entries.flatMap((e) => (e.kind === 'updated' ? [e] : []));
  const manual = report.entries.flatMap((e) => (e.kind === 'manual' ? [e] : []));
  const skipped = report.entries.flatMap((e) => (e.kind === 'skipped' ? [e] : []));
  const counts = [`- 已更新：${updated.length} 個整合包`, `- 需要人工處理：${manual.length} 個`, `- 略過：${skipped.length} 個`];
  return [
    '## 摘要', '', ...counts, '', ...(updated.length === 0 ? [NO_UPDATES_LINE, ''] : []),
    ...section('已更新', updated.length === 0 ? [] : [
      '| 整合包 | 版本 | Minecraft | 模組數 | KubeJS 新增 key | FTB 任務新增 key |', '|---|---|---|---|---|---|', ...updated.map(updateRow),
    ]),
    ...section('原文不同（保留既有原文，請確認）', updated.flatMap((u) => u.differing.map((k) => `- ${u.id}：\`${k}\``))),
    ...section('提示', updated.flatMap((u) => u.notes.map((n) => `- ${u.id}：${oneLine(n)}`))),
    ...section('需要人工處理', manual.map((m) => `- ${m.id}：${oneLine(m.reason)}`)),
    ...section('略過', skipped.map((s) => `- ${s.id}：${s.reason}`)),
  ].join('\n');
}
