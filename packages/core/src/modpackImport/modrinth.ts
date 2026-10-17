import { z } from 'zod';
import type { ModpackMod } from '../modpack/schema';
import { readMrpack } from './archive';
import { ModpackImportError, parseOrThrow } from './errors';
import { chunk, type FetchLike, fetchBytes, fetchJson } from './http';
import type { ImportedModpack } from './plan';

export const MODRINTH_API = 'https://api.modrinth.com/v2';
const BATCH_SIZE = 100;

const projectSchema = z.object({ id: z.string().min(1), slug: z.string().min(1), title: z.string().min(1), project_type: z.string() });
const membersSchema = z.array(z.object({ user: z.object({ username: z.string().min(1) }) }));
const versionsSchema = z.array(z.object({
  version_number: z.string().min(1),
  date_published: z.string(),
  files: z.array(z.object({ url: z.string(), filename: z.string(), primary: z.boolean() })),
}));
const projectsSchema = z.array(z.object({ id: z.string().min(1), slug: z.string().min(1) }));

type MrVersion = z.infer<typeof versionsSchema>[number];

export interface ModrinthImportArgs {
  /** slug 或專案 ID */
  readonly ref: string;
  /** version_number；省略時取最新發佈 */
  readonly version?: string;
}

function pickVersion(versions: readonly MrVersion[], wanted: string | undefined): MrVersion {
  if (wanted !== undefined) {
    const found = versions.find((v) => v.version_number === wanted);
    if (!found) throw new ModpackImportError(`Modrinth 上找不到版本 ${wanted}`);
    return found;
  }
  const latest = [...versions].sort((a, b) => b.date_published.localeCompare(a.date_published))[0];
  if (!latest) throw new ModpackImportError('Modrinth 上沒有任何版本');
  return latest;
}

function mrpackFile(version: MrVersion): MrVersion['files'][number] {
  const packs = version.files.filter((f) => f.filename.endsWith('.mrpack'));
  const file = packs.find((f) => f.primary) ?? packs[0];
  if (!file) throw new ModpackImportError(`${version.version_number} 沒有 .mrpack 檔案`);
  return file;
}

async function lookupSlugs(fetchImpl: FetchLike, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const batches = await Promise.all(chunk(ids, BATCH_SIZE).map(async (batch) => {
    const url = `${MODRINTH_API}/projects?ids=${encodeURIComponent(JSON.stringify(batch))}`;
    return parseOrThrow(projectsSchema, await fetchJson(fetchImpl, url), 'Modrinth 專案清單');
  }));
  return new Map(batches.flat().map((p) => [p.id, p.slug]));
}

export async function importFromModrinth(fetchImpl: FetchLike, args: ModrinthImportArgs): Promise<ImportedModpack> {
  const projectUrl = `${MODRINTH_API}/project/${encodeURIComponent(args.ref)}`;
  const project = parseOrThrow(projectSchema, await fetchJson(fetchImpl, projectUrl), 'Modrinth 專案');
  if (project.project_type !== 'modpack') throw new ModpackImportError(`${project.slug} 不是整合包（類型：${project.project_type}）`);
  const [members, versions] = await Promise.all([
    fetchJson(fetchImpl, `${MODRINTH_API}/project/${project.id}/members`).then((raw) => parseOrThrow(membersSchema, raw, 'Modrinth 成員')),
    fetchJson(fetchImpl, `${MODRINTH_API}/project/${project.id}/version`).then((raw) => parseOrThrow(versionsSchema, raw, 'Modrinth 版本')),
  ]);
  const version = pickVersion(versions, args.version);
  const file = mrpackFile(version);
  const { index, kubejs } = await readMrpack(await fetchBytes(fetchImpl, file.url), file.filename);
  const slugs = await lookupSlugs(fetchImpl, index.projectIds);
  const mods: ModpackMod[] = index.projectIds.flatMap((id) => {
    const slug = slugs.get(id);
    return slug ? [{ platform: 'modrinth' as const, projectId: id, slug }] : [];
  });
  const notes = [
    ...index.unknownFiles.map((path) => `略過非 Modrinth 來源的檔案：${path}`),
    ...index.projectIds.filter((id) => !slugs.has(id)).map((id) => `Modrinth 查不到專案 ${id}，未列入模組清單`),
  ];
  return {
    platform: 'modrinth',
    projectId: project.id,
    slug: project.slug,
    name: project.title,
    authors: [...new Set(members.map((m) => m.user.username))],
    version: version.version_number,
    mcVersion: index.mcVersion,
    loader: index.loader,
    mods,
    kubejs,
    notes,
  };
}
