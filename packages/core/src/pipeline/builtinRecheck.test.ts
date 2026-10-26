import { describe, expect, it } from 'vitest';
import { builtinModSchema, catalogModSchema, keysNotNeededFor } from '../catalog';
import type { DetectedMod } from '../types';
import { builtinRecheckTarget, fromModrinthVersion, type PlatformBuild, recheckBuiltin, renderTrackSummary } from './index';

const entry = builtinModSchema.parse({
  modId: 'demo', name: 'Demo', summary: '示範模組。', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.21.1'], loaders: ['neoforge'], checkedVersion: { modVersion: '1.0', mcVersion: '1.21.1', loader: 'neoforge' },
  updatedAt: '2026-10-01',
});

const v = (id: string, num: string, games: string[], loaders: string[], date: string, prerelease = false): PlatformBuild => ({
  ...fromModrinthVersion({ id, version_number: num, game_versions: games, loaders, date_published: date, files: [{ url: `https://cdn/${id}.jar`, filename: `${id}.jar`, primary: true }] }),
  ...(prerelease ? { prerelease: true } : {}),
});

const detected = (source: Record<string, string>, zhTw?: Record<string, string>): DetectedMod => ({
  modId: 'demo', name: 'Demo', version: '2.0', jarName: 'demo.jar', format: 'json', source, order: Object.keys(source), ...(zhTw ? { zhTw } : {}),
});

describe('builtinRecheckTarget', () => {
  it('picks the newest release for the newest Minecraft version', () => {
    const target = builtinRecheckTarget(entry, [
      v('a', '1.0', ['1.21.1'], ['neoforge'], '2026-01-01'),
      v('b', '2.0', ['26.1'], ['fabric', 'neoforge'], '2026-09-01'),
      v('c', '2.1-beta', ['26.2'], ['neoforge'], '2026-10-01', true),
    ]);
    expect(target && [target.mcVersion, target.loader, target.build.modVersion]).toEqual(['26.1', 'neoforge', '2.0']);
  });

  it('returns null when the checked build is still the newest', () => {
    expect(builtinRecheckTarget(entry, [v('a', '1.0', ['1.21.1'], ['neoforge'], '2026-01-01')])).toBeNull();
  });

  it('never goes back to an older build or an older Minecraft version', () => {
    expect(builtinRecheckTarget(entry, [
      v('a', '1.0', ['1.21.1'], ['neoforge'], '2026-05-01'),
      v('old', '0.9', ['1.21.1'], ['neoforge'], '2026-01-01'),
      v('older-mc', '2.0', ['1.20.4'], ['neoforge'], '2026-09-01'),
    ])).toBeNull();
  });

  it('rechecks a newer build of the same Minecraft version', () => {
    const target = builtinRecheckTarget(entry, [v('a', '1.0', ['1.21.1'], ['neoforge'], '2026-01-01'), v('b', '1.1', ['1.21.1'], ['neoforge'], '2026-03-01')]);
    expect(target?.build.modVersion).toBe('1.1');
  });

  it('skips the same Minecraft version when the checked build is not listed', () => {
    expect(builtinRecheckTarget(entry, [v('b', '1.1', ['1.21.1'], ['neoforge'], '2026-03-01')])).toBeNull();
  });
});

describe('recheckBuiltin', () => {
  const target = { mcVersion: '26.1', loader: 'neoforge' as const, build: v('b', '2.0', ['26.1'], ['neoforge'], '2026-09-01') };

  it('updates the checked version when the built-in translation is still complete', () => {
    const r = recheckBuiltin(entry, target, detected({ a: 'Apple' }, { a: '蘋果' }), '2026-10-25');
    expect(r.kind === 'complete' && r.entry).toMatchObject({
      mcVersions: ['26.1', '1.21.1'], checkedVersion: { modVersion: '2.0', mcVersion: '26.1', loader: 'neoforge' }, updatedAt: '2026-10-25',
    });
    expect(r.kind === 'complete' && builtinModSchema.parse(r.entry).modId).toBe('demo');
  });

  it('turns an incomplete entry into a regular mod holding only the missing keys', () => {
    const r = recheckBuiltin(entry, target, detected({ a: 'Apple', b: 'Banana' }, { a: '蘋果' }), '2026-10-25');
    expect(r.kind).toBe('incomplete');
    if (r.kind !== 'incomplete') return;
    expect(r.en).toEqual({ b: 'Banana' });
    const meta = catalogModSchema.parse(r.meta);
    expect(meta.translation.builtinPercent).toBe(50);
    expect(meta.summary).toBe('示範模組。');
    expect(meta.sourceVersions).toEqual([
      { modVersion: '1.0', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: ['b'] },
      { modVersion: '2.0', mcVersion: '26.1', loader: 'neoforge', missingKeys: [] },
    ]);
    expect([meta.mcVersions, meta.loaders]).toEqual([['26.1', '1.21.1'], ['neoforge']]);
  });

  it('keeps older versions the built-in entry covered, so packs for them stay empty', () => {
    const wide = { ...entry, mcVersions: ['26.1', '1.21.1'], loaders: ['neoforge' as const, 'fabric' as const] };
    const r = recheckBuiltin(wide, target, detected({ a: 'Apple', b: 'Banana' }, { a: '蘋果' }), '2026-10-25');
    if (r.kind !== 'incomplete') throw new Error('expected incomplete');
    const meta = catalogModSchema.parse(r.meta);
    expect(meta.sourceVersions.map((s) => [s.modVersion, s.mcVersion, s.loader, s.missingKeys])).toEqual([
      [undefined, '26.1', 'fabric', []],
      ['1.0', '1.21.1', 'neoforge', ['b']],
      [undefined, '1.21.1', 'fabric', ['b']],
      ['2.0', '26.1', 'neoforge', []],
    ]);
    expect([...keysNotNeededFor(meta, '1.21.1')]).toEqual(['b']);
    expect(keysNotNeededFor(meta, '26.1').size).toBe(0);
  });

  it('keeps every key when the new jar no longer ships zh_tw', () => {
    const r = recheckBuiltin(entry, target, detected({ a: 'Apple' }), '2026-10-25');
    expect(r.kind === 'incomplete' && [r.en, r.builtinPercent]).toEqual([{ a: 'Apple' }, undefined]);
  });
});

describe('renderTrackSummary builtin section', () => {
  it('lists recheck results', () => {
    const md = renderTrackSummary({ entries: [], skipped: [], deferred: 0, builtin: [
      { modId: 'demo', kind: 'incomplete', build: '26.1 NeoForge 2.0', detail: 3 },
      { modId: 'jade', kind: 'complete', build: '26.1 NeoForge 9.0' },
    ] });
    expect(md).toContain('## 內建繁中條目重新檢查');
    expect(md).toContain('- demo：26.1 NeoForge 2.0 的內建繁中缺少 3 個 key，已改為一般模組，需要補翻譯');
    expect(md).toContain('- jade：26.1 NeoForge 9.0 的內建繁中仍然完整，已更新檢查版本');
  });
});
