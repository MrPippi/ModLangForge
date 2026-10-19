/**
 * 偵測已收錄模組在 Modrinth／CurseForge 上的新版本與新組合並寫入資料。
 * 用法：npm run track:versions -- [--max-builds 30] [--summary <path>]
 * CurseForge 專有模組需要 CURSEFORGE_API_KEY；沒有金鑰時略過這些模組。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { catalogModSchema } from '@mlf/core/catalog';
import { redact } from '@mlf/core/modpackImport';
import {
  applyVersion, type ModTarget, parseMaxBuilds, planTracking, renderTrackSummary, runWithinBudget, sortTargets, splitBlocked, type TrackReport,
} from '@mlf/core/pipeline';
import { cachedExtract, fileIO } from './lib/addVersion';
import { listBuilds } from './lib/builds';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { MODS_DIR } from './lib/modrinth';

type Skipped = TrackReport['skipped'][number];

const BLOCKED_REASON = '作者不允許第三方下載';

async function planMod(modId: string, apiKey: string | undefined): Promise<{ targets: ModTarget[]; skipped?: Skipped }> {
  try {
    const meta = catalogModSchema.parse(JSON.parse(await readFile(join(MODS_DIR, modId, 'mod.json'), 'utf8')));
    // .lang 模組不追蹤，不必為了規劃去查詢平台
    const source = meta.format === 'json' ? await listBuilds(meta, apiKey) : { builds: [] };
    if ('skip' in source) return { targets: [], skipped: { modId, reason: source.skip } };
    const plan = planTracking(meta, source.builds);
    if (plan.kind === 'skip') return { targets: [], skipped: { modId, reason: plan.reason } };
    return { targets: plan.targets.map((target) => ({ modId, target })) };
  } catch (err) {
    return { targets: [], skipped: { modId, reason: `查詢失敗：${redact(err instanceof Error ? err.message : String(err), apiKey)}` } };
  }
}

const blockedSkip = ({ modId, target }: ModTarget): Skipped => ({
  modId, reason: `${BLOCKED_REASON}（${target.mcVersion} ${target.loader} ${target.version.modVersion}）`,
});

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'max-builds': { type: 'string' }, summary: { type: 'string' } } });
  const max = parseMaxBuilds(values['max-builds']);
  const apiKey = readCurseforgeKey();
  const entries = await readdir(MODS_DIR, { withFileTypes: true });
  const modIds = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const plans = [];
  for (const modId of modIds) plans.push(await planMod(modId, apiKey));
  const { allowed, blocked } = splitBlocked(plans.flatMap((p) => p.targets));
  const io = cachedExtract(fileIO);
  const today = new Date().toLocaleDateString('sv-SE');
  const { entries: results, deferred } = await runWithinBudget(sortTargets(allowed), max, ({ modId, target }) =>
    applyVersion(io, modId, target, today));
  const skipped = [...plans.flatMap((p) => (p.skipped ? [p.skipped] : [])), ...blocked.map(blockedSkip)];
  const summary = renderTrackSummary({ entries: results, skipped, deferred });
  console.log(summary);
  if (values.summary) await writeFile(values.summary, summary, 'utf8');
}

main().catch((err: unknown) => {
  console.error('track-versions 執行失敗：', redact(err instanceof Error ? err.message : String(err), readCurseforgeKey()));
  process.exitCode = 1;
});
