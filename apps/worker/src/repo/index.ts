import { createD1Blocks } from './d1Blocks';
import { createD1Suggestions } from './d1Suggestions';
import type { Repos } from './types';

export function createD1Repos(db: D1Database): Repos {
  return { suggestions: createD1Suggestions(db), blocks: createD1Blocks(db) };
}
