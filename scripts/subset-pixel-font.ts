/**
 * 依網站原始碼中出現的字元，把俐方體 11 號（Cubic 11，OFL 1.1）子集化成 woff2。
 * 需要 Python 3 與 fonttools、brotli：`pip install fonttools brotli`
 *
 * 用法：npm run subset:font -- <Cubic_11.ttf 路徑>
 * 字型下載：https://github.com/ACh-K/Cubic-11/tree/main/fonts/ttf
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'apps', 'site', 'src');
const OUT_FILE = join(ROOT, 'apps', 'site', 'public', 'fonts', 'cubic-11-subset.woff2');
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.astro']);
const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSources(path);
    return SOURCE_EXTS.has(extname(name)) && !name.includes('.test.') ? [path] : [];
  });
}

function collectChars(files: readonly string[]): string {
  const chars = new Set(PRINTABLE_ASCII);
  for (const file of files) {
    for (const ch of readFileSync(file, 'utf8')) {
      if (ch.codePointAt(0)! > 0x7f) chars.add(ch);
    }
  }
  return [...chars].join('');
}

function main(): void {
  const fontPath = process.argv[2];
  if (!fontPath || !existsSync(fontPath)) {
    console.error('請提供 Cubic_11.ttf 路徑：npm run subset:font -- <path>');
    process.exitCode = 1;
    return;
  }
  const chars = collectChars(listSources(SRC_DIR));
  const workDir = mkdtempSync(join(tmpdir(), 'mlf-font-'));
  try {
    const textFile = join(workDir, 'chars.txt');
    writeFileSync(textFile, chars, 'utf8');
    execFileSync('python', [
      '-P', '-m', 'fontTools.subset', resolve(fontPath),
      `--text-file=${textFile}`, '--flavor=woff2', '--layout-features=*', `--output-file=${OUT_FILE}`,
    ], { stdio: 'inherit' });
    console.log(`已輸出 ${OUT_FILE}（${chars.length} 個字元，${statSync(OUT_FILE).size} bytes）`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
