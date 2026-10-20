import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listModIdsIn, readTrackingSourceIn } from './modIds';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlf-modids-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const writeMod = async (id: string, modrinth?: string) => {
  await mkdir(join(dir, 'mods', id), { recursive: true });
  await writeFile(join(dir, 'mods', id, 'mod.json'), JSON.stringify({ links: modrinth ? { modrinth } : {} }), 'utf8');
};
const writeBuiltin = async (id: string, modrinth: string) => {
  await mkdir(join(dir, 'builtin-mods'), { recursive: true });
  await writeFile(join(dir, 'builtin-mods', `${id}.json`), JSON.stringify({ modId: id, links: { modrinth } }), 'utf8');
};

describe('listModIdsIn', () => {
  it('merges mods dirs and builtin json ids, sorted and deduped', async () => {
    await writeMod('c');
    await writeMod('a');
    await writeBuiltin('b', 'https://modrinth.com/mod/b');
    await writeBuiltin('a', 'https://modrinth.com/mod/a');
    await writeFile(join(dir, 'builtin-mods', 'README.txt'), 'x', 'utf8');
    expect(await listModIdsIn(dir)).toEqual(['a', 'b', 'c']);
  });

  it('treats missing folders as empty', async () => {
    expect(await listModIdsIn(dir)).toEqual([]);
    await writeBuiltin('b', 'https://modrinth.com/mod/b');
    expect(await listModIdsIn(dir)).toEqual(['b']);
  });
});

describe('readTrackingSourceIn', () => {
  const writeLinks = async (id: string, links: object) => {
    await mkdir(join(dir, 'mods', id), { recursive: true });
    await writeFile(join(dir, 'mods', id, 'mod.json'), JSON.stringify({ links }), 'utf8');
  };

  it('prefers Modrinth when both links exist', async () => {
    await writeLinks('a', { modrinth: 'https://modrinth.com/mod/m-a', curseforge: 'https://www.curseforge.com/minecraft/mc-mods/c-a' });
    expect(await readTrackingSourceIn(dir, 'a')).toEqual({ platform: 'modrinth', slug: 'm-a' });
  });

  it('uses CurseForge for CurseForge-only mods, including builtin entries', async () => {
    await writeLinks('a', { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/c-a' });
    await mkdir(join(dir, 'builtin-mods'), { recursive: true });
    await writeFile(join(dir, 'builtin-mods', 'b.json'), JSON.stringify({ modId: 'b', links: { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/c-b' } }), 'utf8');
    expect(await readTrackingSourceIn(dir, 'a')).toEqual({ platform: 'curseforge', slug: 'c-a' });
    expect(await readTrackingSourceIn(dir, 'b')).toEqual({ platform: 'curseforge', slug: 'c-b' });
  });

  it('returns null when no usable link', async () => {
    await writeLinks('a', {});
    expect(await readTrackingSourceIn(dir, 'a')).toBeNull();
  });
});
