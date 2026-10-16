import { readdir } from 'node:fs/promises';

/** Workers 靜態資產：免費方案每版本 20,000 檔；超過 15,000 先警告（規格 §11） */
export const DIST_FILE_LIMITS = { warn: 15_000, max: 20_000 } as const;

export type DistLevel = 'ok' | 'warn' | 'error';

export interface DistVerdict {
  readonly level: DistLevel;
  readonly message: string;
}

/** 遞迴計算目錄內的檔案數（不含資料夾） */
export async function countFiles(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).length;
}

export function distFileVerdict(count: number, limits: { readonly warn: number; readonly max: number } = DIST_FILE_LIMITS): DistVerdict {
  if (count > limits.max) {
    return { level: 'error', message: `dist 有 ${count} 個檔案，超過 Workers 免費方案每版本 ${limits.max} 檔上限，部署會失敗。` };
  }
  if (count > limits.warn) {
    return { level: 'warn', message: `dist 有 ${count} 個檔案，已超過 ${limits.warn}（Workers 免費方案每版本上限 ${limits.max}）；請規劃升級付費方案或減少檔案。` };
  }
  return { level: 'ok', message: `dist 有 ${count} 個檔案（警告門檻 ${limits.warn}）。` };
}
