function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * mod.json 的 links 加入 curseforge（放在 modrinth 之後；沒有 modrinth 時放最前面）。
 * 若已有 curseforge 連結，會被取代（呼叫端須先跳過已有 curseforge 連結的模組）。
 * 其餘欄位與順序不變、不補 schema 預設值、不修改輸入；以 toJson 寫回時只多一行。
 */
export function withCurseforgeLink(meta: Readonly<Record<string, unknown>>, url: string): Record<string, unknown> {
  const entries = Object.entries(isRecord(meta.links) ? meta.links : {}).filter(([key]) => key !== 'curseforge');
  const at = entries.findIndex(([key]) => key === 'modrinth') + 1;
  return { ...meta, links: Object.fromEntries([...entries.slice(0, at), ['curseforge', url], ...entries.slice(at)]) };
}
