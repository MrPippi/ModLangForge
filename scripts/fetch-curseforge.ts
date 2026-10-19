/**
 * 依 CurseForge 總下載量排名收錄模組，擷取 en_us 並在 data/mods 建立待翻譯的資料夾。
 * 用法：npm run fetch:curseforge -- --limit 100 [--scan 3000] [--dry-run]
 * - Modrinth 上也有的模組以 Modrinth 為準（同時寫入兩個連結）；Modrinth 沒有可用版本時直接略過，不改用 CurseForge。
 * - CurseForge 專有模組直接從 CurseForge 下載 jar；作者不允許第三方下載的模組會略過。
 * - --dry-run 只輸出判斷結果，不寫入任何檔案。
 * 需要 CURSEFORGE_API_KEY（環境變數或專案根目錄 .env）。
 */
import { parseArgs } from 'node:util';
import { curseforgeModUrl } from '@mlf/core/curseforgeLinks';
import {
  CurseforgeDownloadBlocked, type CurseforgeProject, curseforgeRankingPage, downloadCurseforgeJar, draftFromCurseforge, listCurseforgeBuilds,
  routeCurseforgeHit,
} from '@mlf/core/curseforgeMods';
import { CURSEFORGE_KEY_ENV, MISSING_KEY_MESSAGE, redact } from '@mlf/core/modpackImport';
import {
  buildSourceRef, draftFromModrinthHit, fromModrinthVersion, type ModrinthHit, type ModrinthVersion, pickBuild, pickVersion,
} from '@mlf/core/pipeline';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { ingestBuild, UNKNOWN_SOURCE_SKIP } from './lib/ingest';
import { API, downloadJar, getJson, getJsonOrNull } from './lib/modrinth';
import { listCurseforgeSlugs, listModIds } from './lib/modrinthLinks';

const RANKING_PAGE_SIZE = 50;
const NO_VERSION = '沒有 1.21.1/1.20.1 版本';

interface ModrinthProject {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly categories: readonly string[];
  readonly loaders: readonly string[];
  readonly game_versions: readonly string[];
}

interface ModrinthMember {
  readonly role: string;
  readonly user: { readonly username: string };
}

interface Counterpart {
  readonly hit: ModrinthHit;
  readonly authors: readonly string[];
}

interface Context {
  readonly apiKey: string;
  readonly existing: Set<string>;
  readonly existingSlugs: Set<string>;
  readonly today: string;
  readonly dryRun: boolean;
}

/** 以 CurseForge slug 在 Modrinth 查同名專案；作者取 Owner（沒有則全部成員） */
async function findModrinthCounterpart(slug: string): Promise<Counterpart | null> {
  const project = await getJsonOrNull<ModrinthProject>(`${API}/project/${encodeURIComponent(slug)}`);
  if (!project) return null;
  const members = (await getJsonOrNull<ModrinthMember[]>(`${API}/project/${project.id}/members`)) ?? [];
  const owners = members.filter((m) => m.role === 'Owner');
  const authors = (owners.length > 0 ? owners : members).map((m) => m.user.username);
  const hit: ModrinthHit = {
    project_id: project.id,
    slug: project.slug,
    title: project.title,
    author: authors[0] ?? '',
    description: project.description,
    categories: [...project.categories, ...project.loaders],
    versions: project.game_versions,
  };
  return { hit, authors };
}

/** Modrinth 對應專案：沒有可用版本或 jar 時略過，不改用 CurseForge */
async function ingestFromModrinth(ctx: Context, project: CurseforgeProject, hit: ModrinthHit): Promise<string> {
  const version = pickVersion(await getJson<ModrinthVersion[]>(`${API}/project/${hit.project_id}/version`));
  if (!version) return `skip: Modrinth 上${NO_VERSION}`;
  const build = fromModrinthVersion(version);
  if (!buildSourceRef(build)) return UNKNOWN_SOURCE_SKIP;
  const jar = await downloadJar(version);
  if (!jar) return 'skip: Modrinth 上沒有可用的 jar';
  const draft = draftFromModrinthHit(hit, curseforgeModUrl(project.slug));
  return ingestBuild({ draft, build, jar, existing: ctx.existing, today: ctx.today, dryRun: ctx.dryRun });
}

/** CurseForge 專有模組：直接從 CurseForge 下載 */
async function ingestFromCurseforge(ctx: Context, project: CurseforgeProject): Promise<string> {
  const builds = await listCurseforgeBuilds(fetch, ctx.apiKey, project.id);
  const build = pickBuild(builds);
  if (!build) return `skip: CurseForge 上${NO_VERSION}`;
  if (!buildSourceRef(build)) return UNKNOWN_SOURCE_SKIP;
  let jar: Uint8Array;
  try {
    jar = await downloadCurseforgeJar(fetch, build);
  } catch (err) {
    if (err instanceof CurseforgeDownloadBlocked) return 'skip: 作者不允許第三方下載';
    throw err;
  }
  return ingestBuild({ draft: draftFromCurseforge(project, builds), build, jar, existing: ctx.existing, today: ctx.today, dryRun: ctx.dryRun });
}

async function processProject(ctx: Context, project: CurseforgeProject): Promise<string> {
  const known = { project, existingCurseforgeSlugs: ctx.existingSlugs };
  if (routeCurseforgeHit({ ...known, modrinth: null }) === 'exists') return 'skip: 已收錄';
  const counterpart = await findModrinthCounterpart(project.slug);
  const modrinth = counterpart ? { slug: counterpart.hit.slug, title: counterpart.hit.title, authors: counterpart.authors } : null;
  const route = routeCurseforgeHit({ ...known, modrinth });
  if (route === 'modrinth' && counterpart) return `[Modrinth] ${await ingestFromModrinth(ctx, project, counterpart.hit)}`;
  return `[CurseForge] ${await ingestFromCurseforge(ctx, project)}`;
}

function errorMessage(err: unknown, apiKey: string): string {
  return redact(err instanceof Error ? err.message : String(err), apiKey);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { limit: { type: 'string', default: '15' }, scan: { type: 'string', default: '3000' }, 'dry-run': { type: 'boolean', default: false } },
  });
  const limit = Number(values.limit);
  const scan = Number(values.scan);
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(scan) || scan < 1) throw new Error('--limit 與 --scan 必須是正整數');
  const apiKey = readCurseforgeKey();
  if (!apiKey) {
    console.error(MISSING_KEY_MESSAGE);
    process.exitCode = 1;
    return;
  }
  const ctx: Context = {
    apiKey,
    existing: new Set(await listModIds()),
    existingSlugs: new Set(await listCurseforgeSlugs()),
    today: new Date().toLocaleDateString('sv-SE'),
    dryRun: values['dry-run'],
  };
  if (ctx.dryRun) console.log('（--dry-run：只輸出判斷結果，不寫入任何檔案）');
  let added = 0;
  let addedBuiltin = 0;
  for (let index = 0; index < scan && added < limit; index += RANKING_PAGE_SIZE) {
    const page = await curseforgeRankingPage(fetch, apiKey, index);
    if (page.length === 0) break;
    for (const project of page) {
      if (added >= limit) break;
      let outcome: string;
      try {
        outcome = await processProject(ctx, project);
      } catch (err) {
        outcome = `error: ${errorMessage(err, apiKey)}`;
      }
      if (outcome.includes('ADDED')) {
        added += 1;
        ctx.existingSlugs.add(project.slug);
      }
      if (outcome.includes('ADDED-BUILTIN')) addedBuiltin += 1;
      console.log(`${project.slug.padEnd(32)} ${outcome}`);
    }
  }
  const where = ctx.dryRun ? '（dry-run，未寫入）' : '';
  console.log(`\n新增 ${added - addedBuiltin} 個模組到 data/mods（zh_tw.json 為空，待翻譯）、${addedBuiltin} 個內建繁中條目到 data/builtin-mods${where}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('fetch-curseforge 執行失敗：', redact(message, process.env[CURSEFORGE_KEY_ENV]?.trim()));
  process.exitCode = 1;
});
