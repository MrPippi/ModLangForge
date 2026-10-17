import { stripBom } from '../lang/types';

/** readFile／readdir 的「不存在」錯誤 */
export function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/** JSON 文字（可含 BOM）→ 值；失敗時回傳可直接顯示的訊息 */
export function parseJsonText(text: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: string } {
  try {
    return { ok: true, value: JSON.parse(stripBom(text)) as unknown };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
