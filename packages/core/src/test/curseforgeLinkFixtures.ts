import { CF_API } from './modpackFixtures';

/** CurseForge 搜尋結果中的一個專案（classId 6＝模組） */
export function cfMod(id: number, name: string, slug: string, classId = 6) {
  return { id, name, slug, classId, authors: [{ name: 'someone' }] };
}

export function cfSlugSearch(slug: string): string {
  return `${CF_API}/mods/search?gameId=432&classId=6&slug=${encodeURIComponent(slug)}`;
}

export function cfNameSearch(name: string): string {
  return `${CF_API}/mods/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(name)}&pageSize=20`;
}

/** 與 data/mods/<id>/mod.json 相同結構的原始物件（未經 schema 解析） */
export function rawMod(modId: string, name: string, links: Readonly<Record<string, string>>): Record<string, unknown> {
  return {
    modId,
    name,
    aliases: [],
    summary: '測試用模組。',
    authors: ['someone'],
    links,
    sourceVersions: [{ modVersion: '1.0.0', mcVersion: '1.20.1', loader: 'forge', missingKeys: [] }],
    mcVersions: ['1.20.1'],
    loaders: ['forge'],
    format: 'json',
    translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'Claude 機器翻譯', url: null }, contributors: [] },
    updatedAt: '2026-10-01',
  };
}
