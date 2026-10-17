import JSZip from 'jszip';
import { parseGuidePath, type ModProject } from '@mlf/core';
import { DEFAULT_MC_VERSION, type ExportResult, guideTranslations } from '@mlf/core/export';
import { parseModpackProjectId } from '@mlf/core/modpack';
import { REPO } from '../../lib/config';

const LEGACY_MC_VERSION = '1.12.2';

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

/** 預填的 mod.json；作者、連結、載入器需投稿者確認 */
function draftModJson(p: ModProject, today: string): Record<string, unknown> {
  const mcVersion = p.format === 'lang' ? LEGACY_MC_VERSION : DEFAULT_MC_VERSION;
  return {
    modId: p.modId,
    name: p.name,
    aliases: [],
    summary: '（請改成一句話的繁體中文簡介）',
    authors: ['（請填寫模組作者）'],
    links: { modrinth: `https://modrinth.com/mod/${p.modId}` },
    mcVersions: [mcVersion],
    loaders: ['forge'],
    sourceVersions: [{ ...(p.version !== 'unknown' ? { modVersion: p.version } : {}), mcVersion, loader: 'forge', missingKeys: [] }],
    format: p.format,
    translation: {
      status: 'partial',
      license: 'CC-BY-SA-4.0',
      source: { name: 'ModLangForge 貢獻者', url: null },
      contributors: [],
    },
    updatedAt: today,
  };
}

function readme(modIds: readonly string[], kubejsPaths: readonly string[]): string {
  return [
    'ModLangForge 翻譯投稿檔',
    '',
    ...(modIds.length > 0 ? [`包含模組：${modIds.join(', ')}`] : []),
    ...(kubejsPaths.length > 0 ? [`包含整合包文字：${kubejsPaths.join(', ')}`] : []),
    '',
    '投稿步驟：',
    `1. Fork https://github.com/${REPO}`,
    '2. 把每個模組資料夾放到 data/mods/ 底下（資料夾名稱即 modId）。',
    '   含手冊的模組另有 patchouli/ 資料夾與 patchouli_zh_tw.json，請整個資料夾一起放入。',
    '   整合包文字在 modpacks/ 資料夾：把 modpacks/<整合包>/kubejs/<命名空間>/zh_tw.json 放到 data/ 底下相同的位置（取代原本的 zh_tw.json）。',
    '3. 檢查 mod.json：簡介、作者、連結、支援版本、載入器、來源版本（sourceVersions）。',
    '4. 執行 npm run validate:data 確認格式正確。',
    '5. 送出 Pull Request。',
    '',
    '投稿的譯文將以 CC BY-SA 4.0 授權釋出。',
    '',
  ].join('\n');
}

/** 原樣手冊檔與攤平後的手冊譯文；沒有手冊（或手冊沒有可翻譯的條目）時回傳空陣列。路徑經 parseGuidePath 驗證 */
function guideContributionFiles(p: ModProject): [string, string][] {
  if (!(p.guide?.entries ?? []).some((e) => e.status !== 'obsolete')) return [];
  const raw = Object.entries(p.guide?.files ?? {})
    .filter(([path]) => parseGuidePath(path) !== null)
    .map(([path, text]): [string, string] => [`patchouli/${path}`, text]);
  return raw.length === 0 ? [] : [...raw, ['patchouli_zh_tw.json', toJson(guideTranslations(p))]];
}

function translatedEntries(p: ModProject): Record<string, string> {
  return Object.fromEntries(p.entries.filter((e) => e.status !== 'obsolete' && e.target !== '').map((e) => [e.key, e.target]));
}

function modFiles(p: ModProject, today: string): [string, string][] {
  const active = p.entries.filter((e) => e.status !== 'obsolete');
  return [
    [`${p.modId}/mod.json`, toJson(draftModJson(p, today))],
    [`${p.modId}/en_us.json`, toJson(Object.fromEntries(active.map((e) => [e.key, e.source])))],
    [`${p.modId}/zh_tw.json`, toJson(translatedEntries(p))],
    ...guideContributionFiles(p).map(([path, text]): [string, string] => [`${p.modId}/${path}`, text]),
  ];
}

/** 整合包 KubeJS 專案只輸出譯文；英文原文由維護者以 add:modpack 維護 */
function kubejsPath(ref: { readonly modpackId: string; readonly ns: string }): string {
  return `modpacks/${ref.modpackId}/kubejs/${ref.ns}/zh_tw.json`;
}

export async function buildContribution(projects: readonly ModProject[], today: string): Promise<ExportResult> {
  const zip = new JSZip();
  const refs = projects.map((p) => parseModpackProjectId(p.id));
  projects.forEach((p, i) => {
    const ref = refs[i];
    const files: [string, string][] = ref ? [[kubejsPath(ref), toJson(translatedEntries(p))]] : modFiles(p, today);
    for (const [path, text] of files) zip.file(path, text);
  });
  const modIds = projects.filter((_, i) => !refs[i]).map((p) => p.modId);
  zip.file('README.txt', readme(modIds, refs.flatMap((r) => (r ? [kubejsPath(r)] : []))));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { fileName: 'ModLangForge-contribution.zip', blob: new Blob([bytes as BlobPart], { type: 'application/zip' }) };
}
