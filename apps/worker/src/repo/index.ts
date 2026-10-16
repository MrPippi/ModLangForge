import { createD1Blocks } from './d1Blocks';
import { createD1Review } from './d1Review';
import { createD1Suggestions } from './d1Suggestions';
import { createD1Users } from './d1Users';
import type { Repos } from './types';

export function createD1Repos(db: D1Database): Repos {
  return { suggestions: createD1Suggestions(db), blocks: createD1Blocks(db), users: createD1Users(db), review: createD1Review(db) };
}
