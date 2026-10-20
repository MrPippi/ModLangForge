import { describe, expect, it, vi } from 'vitest';
import { type ApplyResult, fromModrinthVersion, type ModTarget, runWithinBudget } from './index';

const target = (modId: string): ModTarget => ({
  modId,
  target: { kind: 'add', mcVersion: '1.21.1', loader: 'fabric', version: fromModrinthVersion({ id: modId, version_number: '1', game_versions: [], loaders: [], date_published: '', files: [] }) },
});

const written: ApplyResult = { kind: 'written', addedKeys: 1, conflicts: [], replaced: [] };
const failed: ApplyResult = { kind: 'error', message: 'no jar' };

describe('runWithinBudget', () => {
  it('counts only successful writes toward the limit, so persistent failures do not starve it', async () => {
    const items = ['bad1', 'bad2', 'ok1', 'ok2', 'ok3'].map(target);
    const apply = vi.fn(async (t: ModTarget) => (t.modId.startsWith('bad') ? failed : written));
    const { entries, deferred } = await runWithinBudget(items, 2, apply);
    expect(entries.map((e) => `${e.modId}:${e.result.kind}`)).toEqual(['bad1:error', 'bad2:error', 'ok1:written', 'ok2:written']);
    expect(deferred).toBe(1);
  });

  it('stops after the attempt budget even when nothing succeeds', async () => {
    const items = Array.from({ length: 10 }, (_, i) => target(`bad${i}`));
    const apply = vi.fn(async () => failed);
    const { entries, deferred } = await runWithinBudget(items, 2, apply, 4);
    expect(entries).toHaveLength(4);
    expect(deferred).toBe(6);
    expect(apply).toHaveBeenCalledTimes(4);
  });

  it('defaults the attempt budget to three times the write limit', async () => {
    const items = Array.from({ length: 10 }, (_, i) => target(`bad${i}`));
    const { entries } = await runWithinBudget(items, 2, async () => failed);
    expect(entries).toHaveLength(6);
  });

  it('applies targets in order, one at a time', async () => {
    const order: string[] = [];
    await runWithinBudget(['a', 'b', 'c'].map(target), 5, async (t) => { order.push(t.modId); return written; });
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
