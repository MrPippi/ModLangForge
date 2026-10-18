import type { ReviewScopeRepo } from './types';

export function createD1ReviewScopes(db: D1Database): ReviewScopeRepo {
  return {
    async list(userId) {
      const { results } = await db.prepare('SELECT mod_id FROM reviewer_mods WHERE user_id = ? ORDER BY mod_id').bind(userId).all<{ mod_id: string }>();
      return results.map((r) => r.mod_id);
    },
    async replace(userId, modIds, now) {
      // 刪除與新增在同一個 batch：全有或全無
      await db.batch([
        db.prepare('DELETE FROM reviewer_mods WHERE user_id = ?').bind(userId),
        db.prepare('INSERT INTO reviewer_mods (user_id, mod_id, created_at) SELECT ?1, value, ?2 FROM json_each(?3)').bind(userId, now, JSON.stringify([...new Set(modIds)])),
      ]);
    },
  };
}
