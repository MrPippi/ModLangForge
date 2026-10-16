import type { ApprovedChange, ChangeResult, StatusChange } from '@mlf/core/review';
import { PUBLISH_LOCK_TTL_MS, type AdminSuggestion, type ReviewRepo } from './reviewTypes';

const SELECT_ADMIN = `SELECT s.id, s.mod_id, s.key, s.base_target, s.proposed, s.note, s.format_warning, s.status,
  s.author_user_id, s.author_hash, s.review_note, s.created_at, s.reviewed_at, u.display_name AS author_name
  FROM suggestions s LEFT JOIN users u ON u.id = s.author_user_id`;

interface AdminRow {
  readonly id: number; readonly mod_id: string; readonly key: string; readonly base_target: string | null;
  readonly proposed: string; readonly note: string | null; readonly format_warning: number; readonly status: AdminSuggestion['status'];
  readonly author_user_id: number | null; readonly author_hash: string; readonly review_note: string | null;
  readonly created_at: string; readonly reviewed_at: string | null; readonly author_name: string | null;
}

const toAdmin = (r: AdminRow): AdminSuggestion => ({
  id: r.id, modId: r.mod_id, key: r.key, baseTarget: r.base_target, proposed: r.proposed, note: r.note,
  formatWarning: r.format_warning === 1, status: r.status, authorUserId: r.author_user_id, authorName: r.author_name,
  authorSubject: r.author_user_id !== null ? `user:${r.author_user_id}` : `ip:${r.author_hash}`,
  reviewNote: r.review_note, createdAt: r.created_at, reviewedAt: r.reviewed_at,
});

function reviewActions(db: D1Database): Pick<ReviewRepo, 'approve' | 'reject' | 'createDirectEdit'> {
  return {
    async approve({ id, reviewerId, proposed, formatWarning, now }) {
      const [first] = await db.batch([
        db.prepare(`UPDATE suggestions SET status = 'approved', proposed = ?2, format_warning = ?3, reviewer_id = ?4, reviewed_at = ?5
                    WHERE id = ?1 AND status = 'pending'`).bind(id, proposed, formatWarning ? 1 : 0, reviewerId, now),
        db.prepare(`UPDATE suggestions SET status = 'superseded', reviewer_id = ?2, reviewed_at = ?3
                    WHERE status = 'pending' AND id <> ?1 AND EXISTS (
                      SELECT 1 FROM suggestions t WHERE t.id = ?1 AND t.status = 'approved' AND t.reviewed_at = ?3
                        AND t.mod_id = suggestions.mod_id AND t.key = suggestions.key)`).bind(id, reviewerId, now),
      ]);
      return (first?.meta.changes ?? 0) === 1;
    },
    async reject({ id, reviewerId, reason, now }) {
      // 發佈進行中時不可退回 approved：它可能已在發佈計畫中，會被推上 main
      const staleBefore = new Date(new Date(now).getTime() - PUBLISH_LOCK_TTL_MS).toISOString();
      const result = await db
        .prepare(`UPDATE suggestions SET status = 'rejected', review_note = ?1, reviewer_id = ?2, reviewed_at = ?3
                  WHERE id = ?4 AND status IN ('pending', 'approved', 'conflict')
                    AND (status <> 'approved' OR NOT EXISTS (SELECT 1 FROM publish_batches WHERE commit_sha IS NULL AND created_at > ?5))`)
        .bind(reason, reviewerId, now, id, staleBefore)
        .run();
      if (result.meta.changes === 1) return 'rejected';
      const row = await db.prepare('SELECT status FROM suggestions WHERE id = ?').bind(id).first<{ status: string }>();
      return row?.status === 'approved' ? 'publish_in_progress' : 'not_rejectable';
    },
    async createDirectEdit({ modId, key, baseTarget, proposed, formatWarning, reviewerId, authorHash, now }) {
      const [, inserted] = await db.batch<{ id: number }>([
        db.prepare(`UPDATE suggestions SET status = 'superseded', reviewer_id = ?3, reviewed_at = ?4
                    WHERE status = 'pending' AND mod_id = ?1 AND key = ?2`).bind(modId, key, reviewerId, now),
        db.prepare(`INSERT INTO suggestions (mod_id, key, base_target, proposed, format_warning, author_user_id, author_hash, status, reviewer_id, created_at, reviewed_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'approved', ?6, ?8, ?8) RETURNING id`)
          .bind(modId, key, baseTarget, proposed, formatWarning ? 1 : 0, reviewerId, authorHash, now),
      ]);
      const id = inserted?.results[0]?.id;
      if (id === undefined) throw new Error('direct edit insert returned no id');
      return id;
    },
  };
}

type PublishActions = Pick<ReviewRepo, 'listApprovedForPublish' | 'acquirePublishLock' | 'releasePublishLock' | 'completePublish'>;

function publishActions(db: D1Database): PublishActions {
  return {
    async listApprovedForPublish(): Promise<ApprovedChange[]> {
      const { results } = await db
        .prepare(`SELECT s.id, s.mod_id, s.key, s.base_target, s.proposed, COALESCE(s.reviewed_at, s.created_at) AS reviewed_at,
                    CASE WHEN u.public = 1 AND u.banned = 0 THEN u.display_name END AS credit_name
                  FROM suggestions s LEFT JOIN users u ON u.id = s.author_user_id
                  WHERE s.status = 'approved' ORDER BY s.id`)
        .all<{ id: number; mod_id: string; key: string; base_target: string | null; proposed: string; reviewed_at: string; credit_name: string | null }>();
      return results.map((r) => ({ id: r.id, modId: r.mod_id, key: r.key, baseTarget: r.base_target, proposed: r.proposed, reviewedAt: r.reviewed_at, creditName: r.credit_name }));
    },
    async acquirePublishLock(createdBy, now) {
      const token = now.toISOString();
      const staleBefore = new Date(now.getTime() - PUBLISH_LOCK_TTL_MS).toISOString();
      const [, inserted] = await db.batch<{ id: number }>([
        db.prepare('DELETE FROM publish_batches WHERE commit_sha IS NULL AND created_at <= ?').bind(staleBefore),
        db.prepare(`INSERT INTO publish_batches (commit_sha, created_by, suggestion_count, created_at)
                    SELECT NULL, ?1, 0, ?2 WHERE NOT EXISTS (SELECT 1 FROM publish_batches WHERE commit_sha IS NULL)
                    RETURNING id`).bind(createdBy, token),
      ]);
      const id = inserted?.results[0]?.id;
      return id === undefined ? null : { id, token };
    },
    async releasePublishLock({ id, token }) {
      await db.prepare('DELETE FROM publish_batches WHERE id = ? AND created_at = ? AND commit_sha IS NULL').bind(id, token).run();
    },
    async completePublish({ lock, commitSha, results, statusChangeIds }) {
      const applied = results.filter((r) => r.outcome === 'applied').length;
      // 子列更新都以「鎖仍屬於自己」為條件，鎖被接管時整批不生效
      const held = commitSha === null
        ? 'EXISTS (SELECT 1 FROM publish_batches WHERE id = ?3 AND created_at = ?4 AND commit_sha IS NULL)'
        : 'EXISTS (SELECT 1 FROM publish_batches WHERE id = ?3 AND created_at = ?4 AND commit_sha = ?5)';
      const guardArgs = commitSha === null ? [lock.id, lock.token] : [lock.id, lock.token, commitSha];
      // 每種結果一條語句、id 以 JSON 陣列綁定：語句數與綁定參數數都固定，不受批次大小影響
      const idsOf = (outcome: ChangeResult['outcome']) => JSON.stringify(results.filter((r) => r.outcome === outcome).map((r) => r.id));
      const setStatus = (outcome: ChangeResult['outcome'], status: string, batchId: number | null) => db
        .prepare(`UPDATE suggestions SET status = '${status}', batch_id = ?1
                  WHERE id IN (SELECT value FROM json_each(?2)) AND status = 'approved' AND ${held}`)
        .bind(batchId, idsOf(outcome), ...guardArgs);
      const updates = [
        setStatus('applied', 'published', commitSha ? lock.id : null),
        setStatus('conflict', 'conflict', null),
        setStatus('superseded', 'superseded', null),
      ];
      const statusUpdates = commitSha === null ? [] : [db
        .prepare(`UPDATE mod_status_changes SET batch_id = ?1 WHERE id IN (SELECT value FROM json_each(?2)) AND ${held}`)
        .bind(lock.id, JSON.stringify(statusChangeIds), ...guardArgs)];
      const batchRow = commitSha === null
        ? db.prepare('DELETE FROM publish_batches WHERE id = ? AND created_at = ? AND commit_sha IS NULL').bind(lock.id, lock.token)
        : db.prepare('UPDATE publish_batches SET commit_sha = ?, suggestion_count = ? WHERE id = ? AND created_at = ? AND commit_sha IS NULL')
          .bind(commitSha, applied, lock.id, lock.token);
      // 有 commit：先更新批次列（子列條件依賴它）；無 commit：批次列最後刪除（子列條件依賴它還在）
      const statements = commitSha === null ? [...updates, batchRow] : [batchRow, ...updates, ...statusUpdates];
      const outcomes = await db.batch(statements);
      const guardResult = commitSha === null ? outcomes[outcomes.length - 1] : outcomes[0];
      if ((guardResult?.meta.changes ?? 0) !== 1) throw new Error('publish lock lost');
    },
  };
}

export function createD1Review(db: D1Database): ReviewRepo {
  return {
    async list({ status, modId, limit }) {
      const { results } = await db
        .prepare(`${SELECT_ADMIN} WHERE s.status = ?1 AND (?2 IS NULL OR s.mod_id = ?2) ORDER BY s.mod_id, s.key, s.created_at, s.id LIMIT ?3`)
        .bind(status, modId, limit)
        .all<AdminRow>();
      return results.map(toAdmin);
    },
    async findById(id) {
      const row = await db.prepare(`${SELECT_ADMIN} WHERE s.id = ?`).bind(id).first<AdminRow>();
      return row ? toAdmin(row) : null;
    },
    ...reviewActions(db),
    async addStatusChange({ modId, status, createdBy, now }) {
      const row = await db
        .prepare('INSERT INTO mod_status_changes (mod_id, status, created_by, created_at) VALUES (?, ?, ?, ?) RETURNING id')
        .bind(modId, status, createdBy, now)
        .first<{ id: number }>();
      if (!row) throw new Error('status change insert returned no id');
      return row.id;
    },
    async listPendingStatusChanges(): Promise<StatusChange[]> {
      const { results } = await db
        .prepare('SELECT id, mod_id, status, created_at FROM mod_status_changes WHERE batch_id IS NULL ORDER BY id')
        .all<{ id: number; mod_id: string; status: StatusChange['status']; created_at: string }>();
      return results.map((r) => ({ id: r.id, modId: r.mod_id, status: r.status, createdAt: r.created_at }));
    },
    async withdrawStatusChange(id, now) {
      // 發佈進行中不可撤回：該變更可能已在發佈計畫中
      const staleBefore = new Date(new Date(now).getTime() - PUBLISH_LOCK_TTL_MS).toISOString();
      const result = await db
        .prepare(`DELETE FROM mod_status_changes WHERE id = ?1 AND batch_id IS NULL
                    AND NOT EXISTS (SELECT 1 FROM publish_batches WHERE commit_sha IS NULL AND created_at > ?2)`)
        .bind(id, staleBefore)
        .run();
      if (result.meta.changes === 1) return 'withdrawn';
      const row = await db.prepare('SELECT batch_id FROM mod_status_changes WHERE id = ?').bind(id).first<{ batch_id: number | null }>();
      return row !== null && row.batch_id === null ? 'publish_in_progress' : 'not_found';
    },
    ...publishActions(db),
  };
}
