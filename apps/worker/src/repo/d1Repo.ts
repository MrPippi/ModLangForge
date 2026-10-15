import type { NewSuggestion, StoredSuggestion, SuggestionRepo } from './types';

const AUTHOR_MATCH = `((?1 IS NOT NULL AND author_user_id = ?1) OR (?1 IS NULL AND author_user_id IS NULL AND author_hash = ?2))`;

export function createD1Repo(db: D1Database): SuggestionRepo {
  return {
    async upsertPending(s: NewSuggestion): Promise<StoredSuggestion> {
      const existing = await db
        .prepare(`SELECT id FROM suggestions WHERE status = 'pending' AND mod_id = ?3 AND key = ?4 AND ${AUTHOR_MATCH}`)
        .bind(s.authorUserId, s.authorHash, s.modId, s.key)
        .first<{ id: number }>();
      if (existing) {
        await db
          .prepare('UPDATE suggestions SET base_target = ?, proposed = ?, note = ?, format_warning = ?, created_at = ? WHERE id = ?')
          .bind(s.baseTarget, s.proposed, s.note, s.formatWarning ? 1 : 0, s.createdAt, existing.id)
          .run();
        return { ...s, id: existing.id, status: 'pending' };
      }
      const inserted = await db
        .prepare(`INSERT INTO suggestions (mod_id, key, base_target, proposed, note, format_warning, author_user_id, author_hash, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?) RETURNING id`)
        .bind(s.modId, s.key, s.baseTarget, s.proposed, s.note, s.formatWarning ? 1 : 0, s.authorUserId, s.authorHash, s.createdAt)
        .first<{ id: number }>();
      if (!inserted) throw new Error('insert suggestion returned no id');
      return { ...s, id: inserted.id, status: 'pending' };
    },
    async countRateEvents(subject, sinceIso) {
      const row = await db
        .prepare('SELECT COUNT(*) AS n FROM rate_events WHERE subject = ? AND created_at >= ?')
        .bind(subject, sinceIso)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },
    async recordRateEvent(subject, atIso) {
      await db.prepare('INSERT INTO rate_events (subject, created_at) VALUES (?, ?)').bind(subject, atIso).run();
    },
    async isBlocked(subjects) {
      if (subjects.length === 0) return false;
      const placeholders = subjects.map(() => '?').join(', ');
      const row = await db
        .prepare(`SELECT 1 AS hit FROM blocked_subjects WHERE subject IN (${placeholders}) LIMIT 1`)
        .bind(...subjects)
        .first<{ hit: number }>();
      return row !== null;
    },
  };
}
