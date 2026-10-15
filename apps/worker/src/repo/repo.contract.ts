import { beforeEach, describe, expect, it } from 'vitest';
import type { NewSuggestion, LegacySuggestionRepo } from './types';

export const sample = (over: Partial<NewSuggestion> = {}): NewSuggestion => ({
  modId: 'create', key: 'block.create.cogwheel', baseTarget: '齒輪', proposed: '小齒輪', note: null,
  formatWarning: false, authorUserId: null, authorHash: 'h1', createdAt: '2026-10-15T00:00:00.000Z', ...over,
});

export function repoContract(name: string, makeRepo: () => Promise<LegacySuggestionRepo>): void {
  describe(`${name} LegacySuggestionRepo contract`, () => {
    let repo: LegacySuggestionRepo;
    beforeEach(async () => { repo = await makeRepo(); });

    it('inserts a pending suggestion', async () => {
      const s = await repo.upsertPending(sample());
      expect(s).toMatchObject({ id: expect.any(Number), status: 'pending', proposed: '小齒輪' });
    });

    it('overwrites the same author pending suggestion for the same key', async () => {
      const first = await repo.upsertPending(sample());
      const second = await repo.upsertPending(sample({ proposed: '大齒輪' }));
      expect(second.id).toBe(first.id);
      expect(second.proposed).toBe('大齒輪');
    });

    it('keeps separate rows for different authors or keys', async () => {
      const a = await repo.upsertPending(sample());
      const b = await repo.upsertPending(sample({ authorHash: 'h2' }));
      const c = await repo.upsertPending(sample({ key: 'other' }));
      expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    });

    it('counts rate events since a time', async () => {
      await repo.recordRateEvent('ip:h1', '2026-10-15T00:00:00.000Z');
      await repo.recordRateEvent('ip:h1', '2026-10-15T01:30:00.000Z');
      await repo.recordRateEvent('ip:h2', '2026-10-15T01:30:00.000Z');
      expect(await repo.countRateEvents('ip:h1', '2026-10-15T01:00:00.000Z')).toBe(1);
    });

    it('purges rate events older than 24h when recording a new one', async () => {
      await repo.recordRateEvent('ip:h1', '2026-10-14T00:00:00.000Z');
      await repo.recordRateEvent('ip:h1', '2026-10-15T01:00:00.000Z');
      expect(await repo.countRateEvents('ip:h1', '1970-01-01T00:00:00.000Z')).toBe(1);
    });

    it('reports blocked subjects', async () => {
      expect(await repo.isBlocked(['ip:h1'])).toBe(false);
    });
  });
}
