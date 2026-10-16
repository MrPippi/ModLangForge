export const DEFAULT_MAX_BUILDS = 100;

/** 解析 --max-builds；只接受正整數字串，未提供時使用預設值 */
export function parseMaxBuilds(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_BUILDS;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`--max-builds 必須是正整數：${raw}`);
  return Number(raw);
}
