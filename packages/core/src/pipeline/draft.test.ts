import { describe, expect, it } from 'vitest';
import { buildBuiltinMeta, buildDraftMeta, draftFromModrinthHit, type ModrinthHit } from './index';

const hit: ModrinthHit = {
  project_id: 'abc', slug: 'demo-mod', title: 'Demo Mod', author: 'someone', description: 'A demo.',
  categories: ['fabric', 'forge', 'utility'], versions: ['1.19.2', '1.20.1', '1.21.1', '1.21.2'],
};
const source = { modVersion: '2.0.0', mcVersion: '1.21.1', loader: 'fabric' } as const;
const CF_URL = 'https://www.curseforge.com/minecraft/mc-mods/demo-mod';

// 以下是改版前（直接收 ModrinthHit）的 buildDraftMeta／buildBuiltinMeta 實際輸出，逐字保存；Modrinth 草稿不可有任何差異
const GOLDEN_DRAFT = '{"modId":"demo","name":"Demo Mod","aliases":["demo-mod"],"summary":"（待補繁中簡介）","authors":["someone"],"links":{"modrinth":"https://modrinth.com/mod/demo-mod"},"sourceVersions":[{"modVersion":"2.0.0","mcVersion":"1.21.1","loader":"fabric","missingKeys":[]}],"mcVersions":["1.21.1","1.20.1","1.19.2"],"loaders":["forge","fabric"],"format":"json","translation":{"status":"machine","license":"CC-BY-SA-4.0","source":{"name":"Claude 機器翻譯","url":null},"contributors":[],"builtinPercent":40},"updatedAt":"2026-10-15"}';
const GOLDEN_DRAFT_SAME_SLUG = '{"modId":"demo-mod","name":"Demo Mod","aliases":[],"summary":"（待補繁中簡介）","authors":["someone"],"links":{"modrinth":"https://modrinth.com/mod/demo-mod"},"sourceVersions":[{"modVersion":"2.0.0","mcVersion":"1.21.1","loader":"fabric","missingKeys":[]}],"mcVersions":["1.21.1","1.20.1","1.19.2"],"loaders":["forge","fabric"],"format":"json","translation":{"status":"machine","license":"CC-BY-SA-4.0","source":{"name":"Claude 機器翻譯","url":null},"contributors":[]},"updatedAt":"2026-10-15"}';
const GOLDEN_BUILTIN = '{"modId":"demo","name":"Demo Mod","aliases":["demo-mod"],"summary":"（待補繁中簡介）","authors":["someone"],"links":{"modrinth":"https://modrinth.com/mod/demo-mod"},"mcVersions":["1.21.1","1.20.1","1.19.2"],"loaders":["forge","fabric"],"updatedAt":"2026-10-15","checkedVersion":{"mcVersion":"1.21.1","loader":"fabric","modVersion":"2.0.0"}}';

describe('Modrinth drafts are unchanged by the platform-neutral input', () => {
  it('keeps buildDraftMeta output byte-identical', () => {
    const project = draftFromModrinthHit(hit);
    expect(JSON.stringify(buildDraftMeta({ project, modId: 'demo', source, builtinPercent: 40, today: '2026-10-15' }))).toBe(GOLDEN_DRAFT);
    expect(JSON.stringify(buildDraftMeta({ project, modId: 'demo-mod', source, today: '2026-10-15' }))).toBe(GOLDEN_DRAFT_SAME_SLUG);
  });

  it('keeps buildBuiltinMeta output byte-identical', () => {
    expect(JSON.stringify(buildBuiltinMeta({ project: draftFromModrinthHit(hit), modId: 'demo', source, today: '2026-10-15' }))).toBe(GOLDEN_BUILTIN);
  });
});

describe('draftFromModrinthHit', () => {
  it('carries the full author list when given', () => {
    expect(draftFromModrinthHit(hit, undefined, ['a', 'b']).authors).toEqual(['a', 'b']);
    expect(draftFromModrinthHit(hit).authors).toEqual(['someone']);
  });

  it('puts the CurseForge link after the Modrinth link when given', () => {
    const meta = buildDraftMeta({ project: draftFromModrinthHit(hit, CF_URL), modId: 'demo', source, today: '2026-10-15' });
    expect(Object.keys(meta.links as object)).toEqual(['modrinth', 'curseforge']);
    expect(meta.links).toEqual({ modrinth: 'https://modrinth.com/mod/demo-mod', curseforge: CF_URL });
  });
});
