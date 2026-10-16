import { resolve } from 'node:path';
import { countFiles, distFileVerdict } from '@mlf/core/node';

const DIST_DIR = resolve(import.meta.dirname, '..', 'apps', 'site', 'dist');
const ANNOTATION = { ok: '', warn: '::warning title=dist file count::', error: '::error title=dist file count::' } as const;

async function main(): Promise<void> {
  const verdict = distFileVerdict(await countFiles(DIST_DIR));
  // GitHub Actions 會把 ::warning::／::error:: 顯示為註記；本機只是一般輸出
  console.log(`${ANNOTATION[verdict.level]}${verdict.message}`);
  if (verdict.level === 'error') process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('check-dist-files 執行失敗（請先 npm run build）', err);
  process.exitCode = 1;
});
