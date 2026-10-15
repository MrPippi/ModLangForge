import { rename, rm, writeFile } from 'node:fs/promises';

export interface FileWrite {
  readonly path: string;
  readonly content: string;
}

const tempPath = (path: string): string => `${path}.tmp`;

/**
 * 先把所有內容寫到暫存檔，全部成功後才逐一改名覆蓋。
 * 寫入階段失敗時清掉暫存檔、原檔不變；改名本身是原子操作，只剩極短的改名間隔可能不一致。
 */
export async function writeFilesTogether(files: readonly FileWrite[]): Promise<void> {
  try {
    await Promise.all(files.map((f) => writeFile(tempPath(f.path), f.content, 'utf8')));
  } catch (err) {
    await Promise.all(files.map((f) => rm(tempPath(f.path), { force: true })));
    throw err;
  }
  for (const f of files) await rename(tempPath(f.path), f.path);
}
