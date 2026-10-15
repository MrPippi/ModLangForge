import { catalogModSchema, catalogToProject, type CatalogMod } from '@mlf/core/catalog';
import { exportProjects, type ExportResult } from '@mlf/core/export';
import { modApiUrl } from '../lib/config';

export interface ModPayload {
  readonly meta: CatalogMod;
  readonly en_us: Readonly<Record<string, string>>;
  readonly zh_tw: Readonly<Record<string, string>>;
}

type FetchLike = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

function isStringRecord(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((v) => typeof v === 'string');
}

/** 取得單一模組資料；404 回傳 null（模組已下架），其他錯誤丟出 */
export async function fetchModData(modId: string, fetchImpl: FetchLike = fetch): Promise<ModPayload | null> {
  const res = await fetchImpl(modApiUrl(modId));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${modId}`);
  const body = (await res.json()) as Record<string, unknown>;
  if (!isStringRecord(body.en_us) || !isStringRecord(body.zh_tw)) throw new Error(`Invalid payload for ${modId}`);
  return { meta: catalogModSchema.parse(body.meta), en_us: body.en_us, zh_tw: body.zh_tw };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function packFileName(modIds: readonly string[], mcVersion: string): string {
  const [only] = modIds;
  return modIds.length === 1 && only ? `${only}-zh_tw-${mcVersion}.zip` : `ModLangForge-zh_tw-${mcVersion}.zip`;
}

/** 在瀏覽器內把一或多個模組打包成單一資源包 */
export async function buildPack(payloads: readonly ModPayload[], mcVersion: string): Promise<ExportResult> {
  const projects = payloads.map((p) => catalogToProject(p.meta, p.en_us, p.zh_tw));
  const result = await exportProjects(projects, {
    kind: 'merged-pack',
    untranslated: 'keep-source',
    mcVersion,
    description: `ModLangForge 繁中翻譯 · ${today()}`,
  });
  return { ...result, fileName: packFileName(payloads.map((p) => p.meta.modId), mcVersion) };
}

export function saveBlob({ blob, fileName }: ExportResult): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
