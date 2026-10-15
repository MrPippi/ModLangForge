/**
 * 把模組的另一個版本加入翻譯來源：下載 jar、以聯集合併 en_us、更新 mod.json 的 sourceVersions。
 * 格式碼衝突時不寫入任何檔案。
 * 用法：npm run add:version -- --mod <modId> --mc <mcVersion> --loader <forge|neoforge|fabric|quilt>
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { catalogModSchema, LOADERS, type CatalogMod } from '@mlf/core/catalog';
import { readJar } from '@mlf/core/jar';
import {
  addSourceVersion, type AddVersionResult, modrinthSlug, type ModrinthVersion, pickVersionFor, primaryFile, sourceOf,
  uncoveredKeys, withSourceVersions,
} from '@mlf/core/pipeline';
import { API, downloadJar, getJson, largestNamespace, MODS_DIR, toJson } from './lib/modrinth';

const USAGE = '用法：npm run add:version -- --mod <modId> --mc <mcVersion> --loader <forge|neoforge|fabric|quilt>';

type Loader = CatalogMod['loaders'][number];

function isLoader(value: string): value is Loader {
  return (LOADERS as readonly string[]).includes(value);
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function fetchIncoming(meta: CatalogMod, mc: string, loader: Loader): Promise<{ version: ModrinthVersion; en: Record<string, string> }> {
  const slug = modrinthSlug(meta.links.modrinth);
  if (!slug) throw new Error(`${meta.modId} 的 mod.json 沒有 Modrinth 連結`);
  const version = pickVersionFor(await getJson<ModrinthVersion[]>(`${API}/project/${slug}/version`), mc, loader);
  if (!version) throw new Error(`Modrinth 上找不到 ${slug} 的 ${mc} ${loader} 版本`);
  const jar = await downloadJar(version);
  if (!jar) throw new Error(`${version.version_number} 沒有可用的 jar（或超過大小上限）`);
  const mods = await readJar(jar, primaryFile(version)?.filename ?? 'mod.jar');
  const detected = mods.find((m) => m.modId === meta.modId && m.format === 'json') ?? largestNamespace(mods);
  if (!detected) throw new Error('jar 內沒有 JSON 語言檔');
  return { version, en: sourceOf(detected, uncoveredKeys(detected).keys) };
}

function reportConflicts(result: AddVersionResult): void {
  for (const c of result.conflicts) {
    console.log(`${c.formatChanged ? '格式碼衝突' : '原文不同'}  ${c.key}\n  既有：${c.existing}\n  新版：${c.incoming}`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { mod: { type: 'string' }, mc: { type: 'string' }, loader: { type: 'string' } } });
  const { mod, mc, loader } = values;
  if (!mod || !mc || !loader || !isLoader(loader)) throw new Error(USAGE);
  const dir = join(MODS_DIR, mod);
  const meta = catalogModSchema.parse(await readJsonFile<unknown>(join(dir, 'mod.json')));
  const en = await readJsonFile<Record<string, string>>(join(dir, 'en_us.json'));
  const incoming = await fetchIncoming(meta, mc, loader);
  const ref = { modVersion: incoming.version.version_number, mcVersion: mc, loader };
  const result = addSourceVersion({ en, sourceVersions: meta.sourceVersions }, ref, incoming.en);
  reportConflicts(result);
  if (result.conflicts.some((c) => c.formatChanged)) {
    console.error('有格式碼衝突，未寫入任何檔案；請人工決定是否拆分版本或改寫原文。');
    process.exitCode = 1;
    return;
  }
  const today = new Date().toLocaleDateString('sv-SE');
  const nextMeta = catalogModSchema.parse(withSourceVersions(meta, result.sourceVersions, today));
  await writeFile(join(dir, 'mod.json'), toJson(nextMeta), 'utf8');
  await writeFile(join(dir, 'en_us.json'), toJson(result.en), 'utf8');
  console.log(`已加入 ${ref.modVersion}（${mc} ${loader}）：新增 ${result.addedKeys.length} 個 key、${result.conflicts.length} 個原文差異`);
}

main().catch((err: unknown) => {
  console.error('add-source-version 執行失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
