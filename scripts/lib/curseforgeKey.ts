import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CURSEFORGE_KEY_ENV } from '@mlf/core/modpackImport';

const ENV_FILE = resolve(import.meta.dirname, '..', '..', '.env');

/** 專案根目錄有 .env 時先載入；回傳去除空白的 CURSEFORGE_API_KEY，未設定時為 undefined。金鑰不寫入、不印出 */
export function readCurseforgeKey(): string | undefined {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  return process.env[CURSEFORGE_KEY_ENV]?.trim() || undefined;
}
