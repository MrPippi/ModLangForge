import JSZip from 'jszip';
import { parseGuidePath, type ModProject } from '@mlf/core';
import { DEFAULT_MC_VERSION, type ExportResult, guideTranslations } from '@mlf/core/export';
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

function readme(modIds: readonly string[]): string {
  return [
    'ModLangForge 翻譯投稿檔',
    '',
    `包含模組：${modIds.join(', ')}`,
    '',
    '投稿步驟：',
    `1. Fork https://github.com/${REPO}`,
    '2. 把每個資料夾放到 data/mods/ 底下（資料夾名稱即 modId）。',
    '   含手冊的模組另有 patchouli/ 資料夾與 patchouli_zh_tw.json，請整個資料夾一起放入。',
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

export async function buildContribution(projects: readonly ModProject[], today: string): Promise<ExportResult> {
  const zip = new JSZip();
  for (const p of projects) {
    const active = p.entries.filter((e) => e.status !== 'obsolete');
    zip.file(`${p.modId}/mod.json`, toJson(draftModJson(p, today)));
    zip.file(`${p.modId}/en_us.json`, toJson(Object.fromEntries(active.map((e) => [e.key, e.source]))));
    zip.file(`${p.modId}/zh_tw.json`, toJson(Object.fromEntries(active.filter((e) => e.target !== '').map((e) => [e.key, e.target]))));
    for (const [path, text] of guideContributionFiles(p)) zip.file(`${p.modId}/${path}`, text);
  }
  zip.file('README.txt', readme(projects.map((p) => p.modId)));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { fileName: 'ModLangForge-contribution.zip', blob: new Blob([bytes as BlobPart], { type: 'application/zip' }) };
}
