import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILTIN_DIR, builtinModSchema, type BuiltinMod } from '../catalog/builtinSchema';
import { isMissing, parseJsonText } from './fsErrors';
import type { DataIssue } from './loadData';

export interface BuiltinLoadResult {
  readonly mods: readonly BuiltinMod[];
  readonly issues: readonly DataIssue[];
}

const EXT = '.json';

function issue(modId: string, message: string): DataIssue {
  return { level: 'error', file: 'builtin.json', modId, message };
}

async function loadOne(dir: string, fileName: string): Promise<{ mod?: BuiltinMod; issues: DataIssue[] }> {
  const modId = fileName.slice(0, -EXT.length);
  const text = await readFile(join(dir, fileName), 'utf8');
  const json = parseJsonText(text);
  if (!json.ok) return { issues: [issue(modId, `JSON 解析失敗：${json.reason}`)] };
  const parsed = builtinModSchema.safeParse(json.value);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((i) => issue(modId, `${i.path.join('.') || '(root)'}：${i.message}`)) };
  }
  if (parsed.data.modId !== modId) {
    return { issues: [issue(modId, `檔名須與 modId 相同：檔名「${modId}」、modId「${parsed.data.modId}」`)] };
  }
  return { mod: parsed.data, issues: [] };
}

/** 讀取 `<dataDir>/builtin-mods/*.json`；有 error 的條目不會出現在 mods 中；資料夾不存在視為空 */
export async function loadAllBuiltinMods(dataDir: string): Promise<BuiltinLoadResult> {
  const dir = join(dataDir, BUILTIN_DIR);
  let names: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    names = entries.filter((e) => e.isFile() && e.name.endsWith(EXT)).map((e) => e.name).sort();
  } catch (err) {
    if (isMissing(err)) return { mods: [], issues: [] };
    throw err;
  }
  const results = await Promise.all(names.map((name) => loadOne(dir, name)));
  return {
    mods: results.flatMap((r) => (r.mod ? [r.mod] : [])),
    issues: results.flatMap((r) => r.issues),
  };
}
