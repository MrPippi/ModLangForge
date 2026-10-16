/**
 * 偵測已收錄模組在 Modrinth 上的新版本與新組合並寫入資料。
 * 用法：npm run track:versions -- [--max-builds 30] [--summary <path>]
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { catalogModSchema } from '@mlf/core/catalog';
import {
  applyVersion, modrinthSlug, type ModrinthVersion, type ModTarget, parseMaxBuilds, planTracking, renderTrackSummary, selectTargets,
  type TrackEntry, type TrackReport,
} from '@mlf/core/pipeline';
import { cachedExtract, fileIO } from './lib/addVersion';
import { API, getJson, MODS_DIR } from './lib/modrinth';

type Skipped = TrackReport['skipped'][number];

async function planMod(modId: string): Promise<{ targets: ModTarget[]; skipped?: Skipped }> {
  try {
    const meta = catalogModSchema.parse(JSON.parse(await readFile(join(MODS_DIR, modId, 'mod.json'), 'utf8')));
    const slug = modrinthSlug(meta.links.modrinth);
    const versions = slug ? await getJson<ModrinthVersion[]>(`${API}/project/${slug}/version`) : [];
    const plan = planTracking(meta, versions);
    if (plan.kind === 'skip') return { targets: [], skipped: { modId, reason: plan.reason } };
    return { targets: plan.targets.map((target) => ({ modId, target })) };
  } catch (err) {
    return { targets: [], skipped: { modId, reason: `查詢失敗：${err instanceof Error ? err.message : String(err)}` } };
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'max-builds': { type: 'string' }, summary: { type: 'string' } } });
  const max = parseMaxBuilds(values['max-builds']);
  const entries = await readdir(MODS_DIR, { withFileTypes: true });
  const modIds = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const plans = [];
  for (const modId of modIds) plans.push(await planMod(modId));
  const { chosen, deferred } = selectTargets(plans.flatMap((p) => p.targets), max);
  const io = cachedExtract(fileIO);
  const today = new Date().toLocaleDateString('sv-SE');
  const results: TrackEntry[] = [];
  for (const { modId, target } of chosen) {
    results.push({ modId, target, result: await applyVersion(io, modId, target, today) });
  }
  const report: TrackReport = { entries: results, skipped: plans.flatMap((p) => (p.skipped ? [p.skipped] : [])), deferred };
  const summary = renderTrackSummary(report);
  console.log(summary);
  if (values.summary) await writeFile(values.summary, summary, 'utf8');
}

main().catch((err: unknown) => {
  console.error('track-versions 執行失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
