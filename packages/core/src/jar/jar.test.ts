import { describe, expect, it } from 'vitest';
import { makeJar } from '../test/makeJar';
import { SKIP_REASONS } from '../patchouli';
import { findLangFiles } from './findLangFiles';
import { JarError } from './errors';
import { readJar } from './readJar';

const EN = JSON.stringify({ 'item.demo.gem': 'Gem', 'item.demo.sword': 'Sword' });

async function expectJarError(promise: Promise<unknown>, code: JarError['code']): Promise<JarError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(JarError);
    expect((err as JarError).code).toBe(code);
    return err as JarError;
  }
  throw new Error('expected JarError');
}

describe('findLangFiles', () => {
  it('matches lang files case-insensitively and lowercases locale', () => {
    const refs = findLangFiles([
      'assets/demo/lang/EN_us.json',
      'assets/demo/lang/en_US.lang',
      'assets/demo/textures/a.png',
      'data/demo/lang/en_us.json',
      'assets/demo/lang/sub/en_us.json',
    ]);
    expect(refs).toEqual([
      { namespace: 'demo', locale: 'en_us', format: 'json', path: 'assets/demo/lang/EN_us.json' },
      { namespace: 'demo', locale: 'en_us', format: 'lang', path: 'assets/demo/lang/en_US.lang' },
    ]);
  });
});

describe('findLangFiles namespace safety', () => {
  it('rejects "." / ".." and namespaces with invalid characters', () => {
    const refs = findLangFiles([
      'assets/../lang/en_us.json',
      'assets/./lang/en_us.json',
      'assets/Bad Name/lang/en_us.json',
      'assets/ok_mod-2.x/lang/en_us.json',
    ]);
    expect(refs.map((r) => r.namespace)).toEqual(['ok_mod-2.x']);
  });
});

describe('readJar', () => {
  it('reads JSON lang with zh_tw and zh_cn', async () => {
    const jar = await makeJar({
      'assets/demo/lang/en_us.json': EN,
      'assets/demo/lang/zh_tw.json': JSON.stringify({ 'item.demo.gem': '寶石' }),
      'assets/demo/lang/zh_cn.json': JSON.stringify({ 'item.demo.sword': '剑' }),
    });
    const [mod, ...rest] = await readJar(jar, 'demo.jar');
    expect(rest).toHaveLength(0);
    expect(mod).toMatchObject({
      modId: 'demo', name: 'demo', version: 'unknown', jarName: 'demo.jar', format: 'json',
      order: ['item.demo.gem', 'item.demo.sword'],
      zhTw: { 'item.demo.gem': '寶石' },
      zhCn: { 'item.demo.sword': '剑' },
    });
  });

  it('reads legacy .lang files', async () => {
    const jar = await makeJar({
      'assets/old/lang/en_US.lang': 'tile.old.block.name=Block\n',
      'assets/old/lang/zh_TW.lang': 'tile.old.block.name=方塊\n',
    });
    const [mod] = await readJar(jar, 'old.jar');
    expect(mod?.format).toBe('lang');
    expect(mod?.zhTw).toEqual({ 'tile.old.block.name': '方塊' });
  });

  it('prefers json when both formats exist', async () => {
    const jar = await makeJar({
      'assets/demo/lang/en_us.json': EN,
      'assets/demo/lang/en_US.lang': 'a=A\n',
    });
    const [mod] = await readJar(jar, 'demo.jar');
    expect(mod?.format).toBe('json');
  });

  it('returns one mod per namespace and skips namespaces without en_us', async () => {
    const jar = await makeJar({
      'assets/a/lang/en_us.json': EN,
      'assets/b/lang/en_us.json': EN,
      'assets/c/lang/zh_tw.json': '{}',
    });
    const mods = await readJar(jar, 'multi.jar');
    expect(mods.map((m) => m.modId)).toEqual(['a', 'b']);
  });

  it('throws no-lang when nothing found', async () => {
    const jar = await makeJar({ 'assets/c/lang/zh_tw.json': '{}' });
    await expectJarError(readJar(jar, 'x.jar'), 'no-lang');
  });

  it('throws not-zip for garbage bytes', async () => {
    await expectJarError(readJar(new TextEncoder().encode('not a zip'), 'bad.jar'), 'not-zip');
  });

  it('throws parse error with path for broken JSON', async () => {
    const jar = await makeJar({ 'assets/demo/lang/en_us.json': '{"a":' });
    const err = await expectJarError(readJar(jar, 'demo.jar'), 'parse');
    expect(err.path).toBe('assets/demo/lang/en_us.json');
  });

  it('throws too-large for oversized input', async () => {
    const big = { byteLength: 300 * 1024 * 1024 } as Uint8Array;
    await expectJarError(readJar(big, 'huge.jar'), 'too-large');
  });
});

describe('readJar metadata', () => {
  const lang = { 'assets/demo/lang/en_us.json': EN };

  it('reads fabric.mod.json', async () => {
    const jar = await makeJar({ ...lang, 'fabric.mod.json': JSON.stringify({ id: 'demo', name: 'Demo Mod', version: '1.2.3' }) });
    expect((await readJar(jar, 'd.jar'))[0]).toMatchObject({ name: 'Demo Mod', version: '1.2.3' });
  });

  it('reads quilt.mod.json', async () => {
    const quilt = { quilt_loader: { id: 'demo', version: '2.0', metadata: { name: 'Quilt Demo' } } };
    const jar = await makeJar({ ...lang, 'quilt.mod.json': JSON.stringify(quilt) });
    expect((await readJar(jar, 'd.jar'))[0]).toMatchObject({ name: 'Quilt Demo', version: '2.0' });
  });

  it('reads META-INF/mods.toml and treats ${file.jarVersion} as unknown', async () => {
    const toml = '[[mods]]\nmodId="demo"\ndisplayName="Forge Demo"\nversion="${file.jarVersion}"\n';
    const jar = await makeJar({ ...lang, 'META-INF/mods.toml': toml });
    expect((await readJar(jar, 'd.jar'))[0]).toMatchObject({ name: 'Forge Demo', version: 'unknown' });
  });

  it('reads META-INF/neoforge.mods.toml', async () => {
    const toml = 'modLoader="javafml"\n[[mods]]\nmodId="demo"\ndisplayName="Neo Demo"\nversion="3.1"\n';
    const jar = await makeJar({ ...lang, 'META-INF/neoforge.mods.toml': toml });
    expect((await readJar(jar, 'd.jar'))[0]).toMatchObject({ name: 'Neo Demo', version: '3.1' });
  });

  it('reads mcmod.info array and modList forms', async () => {
    const arr = JSON.stringify([{ modid: 'demo', name: 'Old Demo', version: '0.9' }]);
    const jar = await makeJar({ ...lang, 'mcmod.info': arr });
    expect((await readJar(jar, 'd.jar'))[0]).toMatchObject({ name: 'Old Demo', version: '0.9' });

    const list = JSON.stringify({ modListVersion: 2, modList: [{ modid: 'demo', name: 'List Demo', version: '1.0' }] });
    const jar2 = await makeJar({ ...lang, 'mcmod.info': list });
    expect((await readJar(jar2, 'd.jar'))[0]).toMatchObject({ name: 'List Demo', version: '1.0' });
  });

  it('ignores broken metadata and falls back to namespace', async () => {
    const jar = await makeJar({ ...lang, 'fabric.mod.json': '{broken', 'META-INF/mods.toml': '[[mods' });
    expect((await readJar(jar, 'd.jar'))[0]).toMatchObject({ name: 'demo', version: 'unknown' });
  });
});

describe('readJar Patchouli guides', () => {
  const lang = { 'assets/demo/lang/en_us.json': EN };
  const entry = JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Hi' }] });

  it('attaches each namespace its own guide files', async () => {
    const jar = await makeJar({
      ...lang,
      'data/demo/patchouli_books/guide/book.json': JSON.stringify({ name: 'demo.book' }),
      'assets/demo/patchouli_books/guide/en_us/entries/intro.json': entry,
      'assets/other/lang/en_us.json': EN,
      'assets/other/patchouli_books/manual/en_us/entries/x.json': entry,
    });
    const [demo, other] = await readJar(jar, 'demo.jar');
    expect(demo?.guide).toEqual({ files: { 'guide/en_us/entries/intro.json': entry }, skipped: [] });
    expect(other?.guide).toEqual({ files: { 'manual/en_us/entries/x.json': entry }, skipped: [] });
  });

  it('keeps lang entries when a guide book is skipped', async () => {
    const jar = await makeJar({ ...lang, 'assets/demo/patchouli_books/guide/en_us/entries/a.json': '{"name":' });
    const [mod] = await readJar(jar, 'demo.jar');
    expect(mod?.order).toEqual(['item.demo.gem', 'item.demo.sword']);
    expect(mod?.guide).toEqual({
      files: {},
      skipped: [{ book: 'guide', reason: SKIP_REASONS.invalidJson('assets/demo/patchouli_books/guide/en_us/entries/a.json') }],
    });
  });

  it('omits guide when the jar has no books', async () => {
    const [mod] = await readJar(await makeJar(lang), 'demo.jar');
    expect(mod).not.toHaveProperty('guide');
  });
});
