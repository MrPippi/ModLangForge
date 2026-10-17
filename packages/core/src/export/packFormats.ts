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
  { mcVersion: '26.3', packFormat: 97, packFormatMinor: 1 },
  { mcVersion: '26.2', packFormat: 88, packFormatMinor: 0 },
  { mcVersion: '26.1.2', packFormat: 84, packFormatMinor: 0 },
  { mcVersion: '26.1.1', packFormat: 84, packFormatMinor: 0 },
  { mcVersion: '26.1', packFormat: 84, packFormatMinor: 0 },
  { mcVersion: '1.21.11', packFormat: 75, packFormatMinor: 0 },
  { mcVersion: '1.21.10', packFormat: 69, packFormatMinor: 0 },
  { mcVersion: '1.21.9', packFormat: 69, packFormatMinor: 0 },
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

/** 資源包格式 65 起（1.21.9 以上）pack.mcmeta 必須寫 min_format／max_format */
export const MIN_MAX_FORMAT_FROM = 65;

export type PackMcmeta =
  | { readonly pack: { readonly pack_format: number; readonly description: string } }
  | {
      readonly pack: {
        readonly description: string;
        readonly min_format: readonly [number, number];
        readonly max_format: readonly [number, number];
      };
    };

/** 每個資源包只對應一個版本：格式 65 以上的 min_format 與 max_format 都等於目標版本，不寫 pack_format */
export function packMcmeta(format: PackFormat, description: string): PackMcmeta {
  if (format.packFormat < MIN_MAX_FORMAT_FROM) return { pack: { pack_format: format.packFormat, description } };
  return {
    pack: {
      description,
      min_format: [format.packFormat, format.packFormatMinor],
      max_format: [format.packFormat, format.packFormatMinor],
    },
  };
}
