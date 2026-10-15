import type { SourceRef } from './addSourceVersion';

/** 以 sourceVersions 取代舊的 modVersion；保留其他欄位與順序 */
export function migrateMeta(raw: Readonly<Record<string, unknown>>, ref: SourceRef): Record<string, unknown> {
  const sourceVersions = [{ ...ref, missingKeys: [] }];
  if (!Object.hasOwn(raw, 'modVersion')) return { ...raw, sourceVersions };
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => (key === 'modVersion' ? ['sourceVersions', sourceVersions] : [key, value])),
  );
}
