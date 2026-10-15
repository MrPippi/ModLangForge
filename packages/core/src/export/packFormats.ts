/**
 * Minecraft 版本 → 資源包 pack_format 對照表。
 * 新版本推出時只需在此新增一列。
 */
export const PACK_FORMATS: readonly { readonly mcVersion: string; readonly packFormat: number }[] = [
  { mcVersion: '1.21.8', packFormat: 64 },
  { mcVersion: '1.21.5', packFormat: 55 },
  { mcVersion: '1.21.4', packFormat: 46 },
  { mcVersion: '1.21.1', packFormat: 34 },
  { mcVersion: '1.20.6', packFormat: 32 },
  { mcVersion: '1.20.4', packFormat: 22 },
  { mcVersion: '1.20.1', packFormat: 15 },
  { mcVersion: '1.19.2', packFormat: 9 },
  { mcVersion: '1.18.2', packFormat: 8 },
  { mcVersion: '1.16.5', packFormat: 6 },
  { mcVersion: '1.12.2', packFormat: 3 },
];

export const DEFAULT_MC_VERSION = '1.20.1';

export function packFormatFor(mcVersion: string): number {
  const found = PACK_FORMATS.find((f) => f.mcVersion === mcVersion)
    ?? PACK_FORMATS.find((f) => f.mcVersion === DEFAULT_MC_VERSION);
  return found?.packFormat ?? 15;
}
