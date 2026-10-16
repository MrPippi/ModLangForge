/**
 * 把模組的另一個版本加入翻譯來源：下載 jar、以聯集合併 en_us、更新 mod.json 的 sourceVersions。
 * 格式碼衝突時不寫入任何檔案。
 * 用法：npm run add:version -- --mod <modId> --mc <mcVersion> --loader <forge|neoforge|fabric|quilt>
 */
import { parseArgs } from 'node:util';
import { LOADERS } from '@mlf/core/catalog';
import { applyVersion, type KeyConflict, type Loader, modrinthSlug, type ModrinthVersion, pickVersionFor, validateAddVersionArgs } from '@mlf/core/pipeline';
import { fileIO } from './lib/addVersion';
import { API, getJson } from './lib/modrinth';

const USAGE = '用法：npm run add:version -- --mod <modId> --mc <mcVersion> --loader <forge|neoforge|fabric|quilt>';

function isLoader(value: string): value is Loader {
  return (LOADERS as readonly string[]).includes(value);
}

function reportConflicts(conflicts: readonly KeyConflict[]): void {
  for (const c of conflicts) {
    console.log(`${c.formatChanged ? '格式碼衝突' : '原文不同'}  ${c.key}\n  既有：${c.existing}\n  新版：${c.incoming}`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { mod: { type: 'string' }, mc: { type: 'string' }, loader: { type: 'string' } } });
  const { mod, mc, loader } = values;
  if (!mod || !mc || !loader || !isLoader(loader)) throw new Error(USAGE);
  const { meta } = await fileIO.readMod(mod);
  const argError = validateAddVersionArgs(meta, mc);
  if (argError) throw new Error(argError);
  const slug = modrinthSlug(meta.links.modrinth);
  if (!slug) throw new Error(`${meta.modId} 的 mod.json 沒有 Modrinth 連結`);
  const version = pickVersionFor(await getJson<ModrinthVersion[]>(`${API}/project/${slug}/version`), mc, loader);
  if (!version) throw new Error(`Modrinth 上找不到 ${slug} 的 ${mc} ${loader} 版本`);
  const result = await applyVersion(fileIO, mod, { mcVersion: mc, loader, version }, new Date().toLocaleDateString('sv-SE'));
  if (result.kind === 'error') throw new Error(result.message);
  reportConflicts(result.conflicts);
  if (result.kind === 'conflict') {
    console.error('有格式碼衝突，未寫入任何檔案；請人工決定是否拆分版本或改寫原文。');
    process.exitCode = 1;
    return;
  }
  for (const old of result.replaced) console.log(`已取代舊建置 ${old.modVersion ?? '（未記錄版本）'}（${old.mcVersion} ${old.loader}）`);
  console.log(`已加入 ${version.version_number}（${mc} ${loader}）：新增 ${result.addedKeys} 個 key、${result.conflicts.length} 個原文差異`);
}

main().catch((err: unknown) => {
  console.error('add-source-version 執行失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
