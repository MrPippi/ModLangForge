import type { ZodType } from 'zod';

/** 新增整合包時的可預期錯誤；訊息直接給維護者看 */
export class ModpackImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModpackImportError';
  }
}

/** 以 zod 驗證外部資料，失敗時丟出可讀的 ModpackImportError */
export function parseOrThrow<T>(schema: ZodType<T>, raw: unknown, what: string): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const details = result.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('；');
  throw new ModpackImportError(`${what} 格式不符：${details}`);
}
