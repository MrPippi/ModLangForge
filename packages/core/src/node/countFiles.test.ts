import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countFiles, DIST_FILE_LIMITS, distFileVerdict } from './countFiles';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlf-dist-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('countFiles', () => {
  it('counts files in nested folders but not the folders themselves', async () => {
    await mkdir(join(dir, 'mods', 'create'), { recursive: true });
    await writeFile(join(dir, 'index.html'), 'x');
    await writeFile(join(dir, '_headers'), 'x');
    await writeFile(join(dir, 'mods', 'create', 'index.html'), 'x');
    expect(await countFiles(dir)).toBe(3);
  });
});

describe('distFileVerdict', () => {
  it('is ok up to the warning threshold', () => {
    expect(distFileVerdict(DIST_FILE_LIMITS.warn).level).toBe('ok');
  });

  it('warns above 15,000 and errors above 20,000', () => {
    expect(distFileVerdict(DIST_FILE_LIMITS.warn + 1)).toEqual({
      level: 'warn',
      message: 'dist 有 15001 個檔案，已超過 15000（Workers 免費方案每版本上限 20000）；請規劃升級付費方案或減少檔案。',
    });
    expect(distFileVerdict(DIST_FILE_LIMITS.max).level).toBe('warn');
    expect(distFileVerdict(DIST_FILE_LIMITS.max + 1).level).toBe('error');
  });

  it('accepts custom limits', () => {
    expect(distFileVerdict(3, { warn: 2, max: 5 }).level).toBe('warn');
  });
});
