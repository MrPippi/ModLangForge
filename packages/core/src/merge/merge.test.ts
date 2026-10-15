import { describe, expect, it } from 'vitest';
import type { DetectedMod } from '../types';
import { buildProject } from './buildProject';
import { mergeProject } from './mergeMod';
import { projectStats } from './stats';
import { updateEntry } from './updateEntry';

function detected(overrides: Partial<DetectedMod> = {}): DetectedMod {
  return {
    modId: 'demo',
    name: 'Demo',
    version: '1.0',
    jarName: 'demo-1.0.jar',
    format: 'json',
    source: { a: 'Apple', b: 'Banana %s' },
    order: ['a', 'b'],
    ...overrides,
  };
}

describe('buildProject', () => {
  it('creates entries in order with existing zh_tw and zh_cn reference', () => {
    const p = buildProject(detected({ zhTw: { a: '蘋果' }, zhCn: { b: '香蕉 %s' } }), 100);
    expect(p).toMatchObject({ id: 'demo', modId: 'demo', name: 'Demo', updatedAt: 100 });
    expect(p.entries).toEqual([
      { key: 'a', source: 'Apple', target: '蘋果', status: 'translated' },
      { key: 'b', source: 'Banana %s', target: '', reference: '香蕉 %s', status: 'untranslated' },
    ]);
  });
});

describe('mergeProject', () => {
  const base = updateEntry(buildProject(detected(), 1), 'a', '蘋果', 2);

  it('keeps translation when source unchanged', () => {
    const merged = mergeProject(base, detected({ version: '1.1' }), 3);
    expect(merged.version).toBe('1.1');
    expect(merged.entries[0]).toMatchObject({ key: 'a', target: '蘋果', status: 'translated' });
  });

  it('clears translation and marks new when source changed', () => {
    const merged = mergeProject(base, detected({ source: { a: 'Red Apple', b: 'Banana %s' } }), 3);
    expect(merged.entries[0]).toMatchObject({ key: 'a', source: 'Red Apple', target: '', status: 'new' });
  });

  it('marks added keys as new, or translated if jar ships zh_tw', () => {
    const merged = mergeProject(
      base,
      detected({ source: { a: 'Apple', b: 'Banana %s', c: 'Cherry', d: 'Date' }, order: ['a', 'b', 'c', 'd'], zhTw: { d: '棗' } }),
      3,
    );
    expect(merged.entries.find((e) => e.key === 'c')).toMatchObject({ target: '', status: 'new' });
    expect(merged.entries.find((e) => e.key === 'd')).toMatchObject({ target: '棗', status: 'translated' });
  });

  it('marks removed keys obsolete and moves them to the end', () => {
    const merged = mergeProject(base, detected({ source: { b: 'Banana %s' }, order: ['b'] }), 3);
    expect(merged.entries.map((e) => [e.key, e.status])).toEqual([
      ['b', 'untranslated'],
      ['a', 'obsolete'],
    ]);
    expect(merged.entries[1]?.target).toBe('蘋果');
  });

  it('does not mutate the existing project', () => {
    const snapshot = JSON.stringify(base);
    mergeProject(base, detected({ source: { b: 'x' }, order: ['b'] }), 3);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('updateEntry', () => {
  const p = buildProject(detected(), 1);

  it('returns a new project and leaves the original intact', () => {
    const next = updateEntry(p, 'a', '蘋果', 5);
    expect(next).not.toBe(p);
    expect(p.entries[0]?.target).toBe('');
    expect(next.entries[0]).toMatchObject({ target: '蘋果', status: 'translated' });
    expect(next.updatedAt).toBe(5);
  });

  it('sets untranslated when cleared', () => {
    const next = updateEntry(updateEntry(p, 'a', 'x', 2), 'a', '', 3);
    expect(next.entries[0]?.status).toBe('untranslated');
  });

  it('returns the same project for unknown key', () => {
    expect(updateEntry(p, 'missing', 'x', 2)).toBe(p);
  });
});

describe('projectStats', () => {
  it('counts translated, warnings and rounded percent, excluding obsolete', () => {
    let p = buildProject(detected({ source: { a: 'A', b: 'B %s', c: 'C' }, order: ['a', 'b', 'c'] }), 1);
    p = updateEntry(p, 'a', '甲', 2);
    p = updateEntry(p, 'b', '乙', 2);
    p = mergeProject(p, detected({ source: { a: 'A', b: 'B %s', c: 'C', d: 'D' }, order: ['a', 'b', 'c', 'd'] }), 3);
    expect(projectStats(p)).toEqual({ total: 4, translated: 2, warnings: 1, percent: 50 });
    const dropped = mergeProject(p, detected({ source: { a: 'A', b: 'B %s', c: 'C' }, order: ['a', 'b', 'c'] }), 4);
    expect(projectStats(dropped)).toEqual({ total: 3, translated: 2, warnings: 1, percent: 67 });
  });

  it('returns 0 percent for empty project', () => {
    const p = buildProject(detected({ source: {}, order: [] }), 1);
    expect(projectStats(p)).toEqual({ total: 0, translated: 0, warnings: 0, percent: 0 });
  });
});
