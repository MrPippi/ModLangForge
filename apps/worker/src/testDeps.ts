import type { AppDeps } from './app';
import { createD1Repos } from './repo';

export const TEST_MOD = { en: { a: 'Apple %s', b: 'Banana' }, zh: { a: '蘋果 %s' } } as const;
export const TEST_NOW = new Date('2026-10-15T12:00:00.000Z');

/** 測試用依賴：D1 repos（搭配 testDb）、Turnstile 通過、固定時間、禁止對外連線 */
export function testDeps(over: Partial<AppDeps> = {}): AppDeps {
  return {
    repos: createD1Repos,
    verifyTurnstile: async () => true,
    loadMod: async (_env, id) => (id === 'create' ? TEST_MOD : null),
    now: () => TEST_NOW,
    fetch: async (input) => { throw new Error(`unexpected outbound fetch: ${String(input)}`); },
    ...over,
  };
}

export interface TestEnvelope<T = Record<string, unknown>> {
  readonly ok: boolean;
  readonly data: T;
  readonly error: { readonly code: string; readonly message: string };
}

export const readJson = async <T = Record<string, unknown>>(res: Response): Promise<TestEnvelope<T>> => (await res.json()) as TestEnvelope<T>;
