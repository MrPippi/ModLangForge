import type { BlockRepo } from './types';

interface BlockRow {
  readonly subject: string;
  readonly reason: string | null;
  readonly created_at: string;
}

export function createD1Blocks(db: D1Database): BlockRepo {
  return {
    async isBlocked(subjects) {
      if (subjects.length === 0) return false;
      const placeholders = subjects.map(() => '?').join(', ');
      const row = await db
        .prepare(`SELECT 1 AS hit FROM blocked_subjects WHERE subject IN (${placeholders}) LIMIT 1`)
        .bind(...subjects)
        .first<{ hit: number }>();
      return row !== null;
    },
    async list(limit) {
      const { results } = await db
        .prepare('SELECT subject, reason, created_at FROM blocked_subjects ORDER BY created_at DESC, subject LIMIT ?')
        .bind(limit)
        .all<BlockRow>();
      return results.map((r) => ({ subject: r.subject, reason: r.reason, createdAt: r.created_at }));
    },
    async add(subject, reason, nowIso) {
      await db
        .prepare(`INSERT INTO blocked_subjects (subject, reason, created_at) VALUES (?, ?, ?)
                  ON CONFLICT(subject) DO UPDATE SET reason = excluded.reason`)
        .bind(subject, reason, nowIso)
        .run();
    },
    async remove(subject) {
      const result = await db.prepare('DELETE FROM blocked_subjects WHERE subject = ?').bind(subject).run();
      return result.meta.changes > 0;
    },
  };
}
