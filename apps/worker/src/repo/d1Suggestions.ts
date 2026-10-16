import { RATE_RETENTION_MS, type AuthorRef, type MySuggestion, type NewSuggestion, type StoredSuggestion, type SuggestionRepo } from './types';

/** ?1 mod_id、?2 key、?3 author_user_id、?4 author_hash */
const PENDING_SAME_AUTHOR = `status = 'pending' AND mod_id = ?1 AND key = ?2
  AND ((?3 IS NOT NULL AND author_user_id = ?3) OR (?3 IS NULL AND author_user_id IS NULL AND author_hash = ?4))`;

const MY_COLUMNS = 'id, mod_id, key, proposed, status, review_note, created_at, reviewed_at';

interface MyRow {
  readonly id: number;
  readonly mod_id: string;
  readonly key: string;
  readonly proposed: string;
  readonly status: MySuggestion['status'];
  readonly review_note: string | null;
  readonly created_at: string;
  readonly reviewed_at: string | null;
}

const toMine = (r: MyRow): MySuggestion => ({
  id: r.id, modId: r.mod_id, key: r.key, proposed: r.proposed, status: r.status,
  reviewNote: r.review_note, createdAt: r.created_at, reviewedAt: r.reviewed_at,
});

async function upsertPending(db: D1Database, s: NewSuggestion): Promise<StoredSuggestion> {
  const args = [s.modId, s.key, s.authorUserId, s.authorHash, s.baseTarget, s.proposed, s.note, s.formatWarning ? 1 : 0, s.createdAt];
  // D1 batch 為單一交易：UPDATE 命中則 INSERT 因 NOT EXISTS 略過，反之亦然
  const results = await db.batch<{ id: number }>([
    db.prepare(`UPDATE suggestions SET base_target = ?5, proposed = ?6, note = ?7, format_warning = ?8, created_at = ?9
                WHERE ${PENDING_SAME_AUTHOR}`).bind(...args),
    db.prepare(`INSERT INTO suggestions (mod_id, key, author_user_id, author_hash, base_target, proposed, note, format_warning, created_at, status)
                SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending'
                WHERE NOT EXISTS (SELECT 1 FROM suggestions WHERE ${PENDING_SAME_AUTHOR})`).bind(...args),
    db.prepare(`SELECT id FROM suggestions WHERE ${PENDING_SAME_AUTHOR} ORDER BY id LIMIT 1`).bind(...args.slice(0, 4)),
  ]);
  const id = results[2]?.results[0]?.id;
  if (id === undefined) throw new Error('upsert suggestion returned no id');
  return { ...s, id, status: 'pending' };
}

export function createD1Suggestions(db: D1Database): SuggestionRepo {
  return {
    upsertPending: (s) => upsertPending(db, s),
    async tryConsumeRate(subject, at, limit, windowMs) {
      const since = new Date(at.getTime() - windowMs).toISOString();
      const cutoff = new Date(at.getTime() - RATE_RETENTION_MS).toISOString();
      const [, inserted] = await db.batch([
        db.prepare('DELETE FROM rate_events WHERE created_at < ?').bind(cutoff),
        db.prepare(`INSERT INTO rate_events (subject, created_at) SELECT ?1, ?2
                    WHERE (SELECT COUNT(*) FROM rate_events WHERE subject = ?1 AND created_at >= ?3) < ?4`)
          .bind(subject, at.toISOString(), since, limit),
      ]);
      return (inserted?.meta.changes ?? 0) === 1;
    },
    async listByAuthor(author: AuthorRef, limit) {
      const stmt = 'userId' in author
        ? db.prepare(`SELECT ${MY_COLUMNS} FROM suggestions WHERE author_user_id = ? ORDER BY id DESC LIMIT ?`).bind(author.userId, limit)
        : db.prepare(`SELECT ${MY_COLUMNS} FROM suggestions WHERE author_user_id IS NULL AND author_hash = ? ORDER BY id DESC LIMIT ?`).bind(author.hash, limit);
      const { results } = await stmt.all<MyRow>();
      return results.map(toMine);
    },
  };
}
