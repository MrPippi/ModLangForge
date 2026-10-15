import type { AppDeps } from './app';
import { createMemoryRepo } from './repo/memoryRepo';

export const TEST_MOD = { en: { a: 'Apple %s', b: 'Banana' }, zh: { a: '蘋果 %s' } } as const;

/** 測試用依賴：記憶體 repo、Turnstile 通過、固定時間 */
export function testDeps(over: Partial<AppDeps> = {}): AppDeps {
  const repo = createMemoryRepo();
  return {
    repo: () => repo,
    verifyTurnstile: async () => true,
    loadMod: async (_env, id) => (id === 'create' ? TEST_MOD : null),
    now: () => new Date('2026-10-15T12:00:00.000Z'),
    ...over,
  };
}

export interface TestEnvelope {
  readonly ok: boolean;
  readonly data: { readonly id: number; readonly formatWarning: boolean };
  readonly error: { readonly code: string; readonly message: string };
}

export const readJson = async (res: Response): Promise<TestEnvelope> => (await res.json()) as TestEnvelope;
