import { describe, expect, it } from 'vitest';
import { createMemoryRepo } from './memoryRepo';
import { repoContract } from './repo.contract';

repoContract('memory', async () => createMemoryRepo());

describe('memory repo blocking', () => {
  it('blocks listed subjects', async () => {
    expect(await createMemoryRepo({ blocked: ['ip:bad'] }).isBlocked(['user:1', 'ip:bad'])).toBe(true);
  });
});
