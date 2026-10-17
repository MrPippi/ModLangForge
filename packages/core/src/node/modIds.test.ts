import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listModIdsIn, readModrinthSlugIn } from './modIds';

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

describe('readModrinthSlugIn', () => {
  it('reads mod.json first', async () => {
    await writeMod('a', 'https://modrinth.com/mod/slug-a');
    await writeBuiltin('a', 'https://modrinth.com/mod/other');
    expect(await readModrinthSlugIn(dir, 'a')).toBe('slug-a');
  });

  it('falls back to builtin-mods/<id>.json', async () => {
    await writeBuiltin('b', 'https://modrinth.com/mod/slug-b');
    expect(await readModrinthSlugIn(dir, 'b')).toBe('slug-b');
  });

  it('returns null when no link', async () => {
    await writeMod('a');
    expect(await readModrinthSlugIn(dir, 'a')).toBeNull();
  });

  it('throws when the mod exists nowhere', async () => {
    await expect(readModrinthSlugIn(dir, 'zzz')).rejects.toThrow();
  });
});
