/** 使用者自行設定的顯示名稱上限（以 Unicode code point 計） */
export const DISPLAY_NAME_MAX = 32;
/** 登入來源（Discord／GitHub）提供的名稱上限，沿用 3B1 */
export const PROVIDER_NAME_MAX = 64;

/** 控制字元、零寬空白、行／段分隔、雙向文字控制與 BOM；ZWJ（U+200D）保留給 emoji */
const UNSAFE_CHARS = /[\p{Cc}\u200B\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/gu;

/** NFC 正規化、危險字元換成空白、連續空白合併、去頭尾 */
export function cleanName(raw: string): string {
  return raw.normalize('NFC').replace(UNSAFE_CHARS, ' ').replace(/\s+/gu, ' ').trim();
}

/** 清理後截斷到 max 個 code point（不切斷代理對） */
export function sanitizeName(raw: string, max: number = PROVIDER_NAME_MAX): string {
  return [...cleanName(raw)].slice(0, max).join('').trim();
}

export type DisplayNameRejection = 'empty' | 'too_long';
export type DisplayNameVerdict =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: DisplayNameRejection };

/** 使用者自填的顯示名稱：清理後 1–DISPLAY_NAME_MAX 字 */
export function validateDisplayName(raw: string): DisplayNameVerdict {
  const name = cleanName(raw);
  if (name === '') return { ok: false, reason: 'empty' };
  if ([...name].length > DISPLAY_NAME_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, name };
}

/** Mojang 帳號名稱：英數與底線，1–16 字 */
export const MINECRAFT_NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/;

export function isMinecraftName(value: string): boolean {
  return MINECRAFT_NAME_PATTERN.test(value);
}

/** 本專案一律以 32 位小寫 hex（無連字號）儲存 UUID */
export const MINECRAFT_UUID_PATTERN = /^[0-9a-f]{32}$/;
