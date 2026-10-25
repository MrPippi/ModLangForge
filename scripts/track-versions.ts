/**
 * 偵測已收錄模組在 Modrinth／CurseForge 上的新版本與新組合並寫入資料。
 * 用法：npm run track:versions -- [--max-builds 30] [--summary <path>]
 * CurseForge 專有模組需要 CURSEFORGE_API_KEY；沒有金鑰時略過這些模組。
 * 內建繁中條目（data/builtin-mods）會用最新版重新檢查：仍然完整就更新檢查版本，不完整就改為一般模組。
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { BUILTIN_DIR, type BuiltinMod, catalogModSchema, toStoredMod } from '@mlf/core/catalog';
import { readJar } from '@mlf/core/jar';
import { loadAllBuiltinMods } from '@mlf/core/node';
import { redact } from '@mlf/core/modpackImport';
import {
  applyVersion, type BuiltinRecheckEntry, builtinRecheckTarget, type ModTarget, recheckBuiltin, selectNamespace, parseMaxBuilds, planTracking, renderTrackSummary, runWithinBudget, sortTargets, splitBlocked, type TrackReport,
} from '@mlf/core/pipeline';
import { cachedExtract, fileIO } from './lib/addVersion';
import { downloadBuildJar, listBuilds } from './lib/builds';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { DATA_DIR, MODS_DIR, toJson } from './lib/modrinth';

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

const LOADER_NAMES: Readonly<Record<string, string>> = { forge: 'Forge', neoforge: 'NeoForge', fabric: 'Fabric', quilt: 'Quilt' };

/** 用最新版重新檢查一個內建繁中條目並寫入結果；沒有新版本時回傳 null */
async function recheckOne(entry: BuiltinMod, apiKey: string | undefined, today: string): Promise<BuiltinRecheckEntry | null> {
  const source = await listBuilds(entry, apiKey);
  if ('skip' in source) return null;
  const target = builtinRecheckTarget(entry, source.builds);
  if (!target) return null;
  const build = `${target.mcVersion} ${LOADER_NAMES[target.loader] ?? target.loader} ${target.build.modVersion}`;
  const jar = await downloadBuildJar(target.build);
  if (!jar) return { modId: entry.modId, kind: 'error', build, detail: '沒有可用的 jar（或超過大小上限）' };
  const detected = selectNamespace(await readJar(jar, target.build.file.name || 'mod.jar'), entry.modId);
  if (!detected) return { modId: entry.modId, kind: 'error', build, detail: `jar 內沒有命名空間為 ${entry.modId} 的 JSON 語言檔` };
  const result = recheckBuiltin(entry, target, detected, today);
  const builtinFile = join(DATA_DIR, BUILTIN_DIR, `${entry.modId}.json`);
  if (result.kind === 'complete') {
    await writeFile(builtinFile, toJson(result.entry), 'utf8');
    return { modId: entry.modId, kind: 'complete', build };
  }
  const dir = join(MODS_DIR, entry.modId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'mod.json'), toJson(toStoredMod(catalogModSchema.parse(result.meta))), 'utf8');
  await writeFile(join(dir, 'en_us.json'), toJson(result.en), 'utf8');
  await writeFile(join(dir, 'zh_tw.json'), toJson({}), 'utf8');
  await rm(builtinFile);
  return { modId: entry.modId, kind: 'incomplete', build, detail: Object.keys(result.en).length };
}

/** 逐一重新檢查內建繁中條目；單一條目失敗只記錄，不中斷 */
async function recheckBuiltins(apiKey: string | undefined, today: string): Promise<BuiltinRecheckEntry[]> {
  const { mods } = await loadAllBuiltinMods(DATA_DIR);
  const results: BuiltinRecheckEntry[] = [];
  for (const entry of mods) {
    try {
      const r = await recheckOne(entry, apiKey, today);
      if (r) results.push(r);
    } catch (err) {
      results.push({ modId: entry.modId, kind: 'error', build: '（未知）', detail: redact(err instanceof Error ? err.message : String(err), apiKey) });
    }
  }
  return results;
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
  const builtin = await recheckBuiltins(apiKey, today);
  const summary = renderTrackSummary({ entries: results, skipped, deferred, builtin });
  console.log(summary);
  if (values.summary) await writeFile(values.summary, summary, 'utf8');
}

main().catch((err: unknown) => {
  console.error('track-versions 執行失敗：', redact(err instanceof Error ? err.message : String(err), readCurseforgeKey()));
  process.exitCode = 1;
});
