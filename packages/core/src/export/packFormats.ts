/**
 * Minecraft 版本 → 資源包格式對照表，新到舊。
 * 1.21.9 起資源包格式分成主、次版本號；之前的版本次版本號為 0。
 * 新版本推出時只需在最前面新增一列。
 */
export interface PackFormat {
  readonly mcVersion: string;
  /** 資源包格式的主版本號（1.21.8 以前就是 pack_format）；所有數字比較都用這個欄位 */
  readonly packFormat: number;
  readonly packFormatMinor: number;
}

export const PACK_FORMATS: readonly PackFormat[] = [
  { mcVersion: '1.21.8', packFormat: 64, packFormatMinor: 0 },
  { mcVersion: '1.21.5', packFormat: 55, packFormatMinor: 0 },
  { mcVersion: '1.21.4', packFormat: 46, packFormatMinor: 0 },
  { mcVersion: '1.21.1', packFormat: 34, packFormatMinor: 0 },
  { mcVersion: '1.20.6', packFormat: 32, packFormatMinor: 0 },
  { mcVersion: '1.20.4', packFormat: 22, packFormatMinor: 0 },
  { mcVersion: '1.20.1', packFormat: 15, packFormatMinor: 0 },
  { mcVersion: '1.19.2', packFormat: 9, packFormatMinor: 0 },
  { mcVersion: '1.18.2', packFormat: 8, packFormatMinor: 0 },
  { mcVersion: '1.16.5', packFormat: 6, packFormatMinor: 0 },
  { mcVersion: '1.12.2', packFormat: 3, packFormatMinor: 0 },
];

export const DEFAULT_MC_VERSION = '1.20.1';

/** 表上沒有的版本丟出錯誤，避免默默產生其他版本的資源包 */
export function packFormatFor(mcVersion: string): PackFormat {
  const found = PACK_FORMATS.find((f) => f.mcVersion === mcVersion);
  if (!found) throw new Error(`不支援的 Minecraft 版本：${mcVersion}`);
  return found;
}
