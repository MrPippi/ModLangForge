import type { ContributorProfile, ContributorRepo, ContributorSummary } from './types';

/** 只公開 public=1 且未停權的作者；匿名建議（author_user_id 為 NULL）以 JOIN 排除 */
const VISIBLE = 'u.public = 1 AND u.banned = 0';
const TOP_MODS = 3;

interface RankRow {
  readonly id: number;
  readonly display_name: string;
  readonly minecraft_uuid: string | null;
  readonly published: number;
  readonly mods: number;
}

interface ProfileRow {
  readonly id: number;
  readonly display_name: string;
  readonly minecraft_name: string | null;
  readonly minecraft_uuid: string | null;
  readonly minecraft_verified: number;
}

interface UserModRow {
  readonly user_id: number;
  readonly mod_id: string;
  readonly count: number;
}

/** 每位使用者前 3 名模組（數量多者優先，相同依 id）；以 json_each 傳入 id 避免超過 D1 綁定參數上限 */
async function topModsByUser(db: D1Database, ids: readonly number[], modId: string | null): Promise<Map<number, string[]>> {
  const { results } = await db
    .prepare(`SELECT s.author_user_id AS user_id, s.mod_id, COUNT(*) AS count
              FROM suggestions s
              WHERE s.status = 'published' AND s.author_user_id IN (SELECT value FROM json_each(?1)) AND (?2 IS NULL OR s.mod_id = ?2)
              GROUP BY s.author_user_id, s.mod_id
              ORDER BY s.author_user_id, count DESC, s.mod_id`)
    .bind(JSON.stringify(ids), modId)
    .all<UserModRow>();
  const byUser = new Map<number, string[]>();
  for (const row of results) {
    const list = byUser.get(row.user_id) ?? [];
    if (list.length < TOP_MODS) byUser.set(row.user_id, [...list, row.mod_id]);
  }
  return byUser;
}

async function ranking(db: D1Database, modId: string | null, limit: number): Promise<ContributorSummary[]> {
  const { results } = await db
    .prepare(`SELECT u.id, u.display_name, u.minecraft_uuid, COUNT(*) AS published, COUNT(DISTINCT s.mod_id) AS mods
              FROM suggestions s JOIN users u ON u.id = s.author_user_id
              WHERE s.status = 'published' AND ${VISIBLE} AND (?1 IS NULL OR s.mod_id = ?1)
              GROUP BY u.id
              -- MIN(s.id) 即插入順序，作為「最早發布」的平手判定
              ORDER BY published DESC, MIN(s.id), u.id
              LIMIT ?2`)
    .bind(modId, limit)
    .all<RankRow>();
  if (results.length === 0) return [];
  // 篩選單一模組時，每人的 topMods 必然只有該模組，不需再查
  const top = modId === null ? await topModsByUser(db, results.map((r) => r.id), null) : null;
  return results.map((r) => ({
    id: r.id, displayName: r.display_name, minecraftUuid: r.minecraft_uuid, published: r.published, mods: r.mods, topMods: modId !== null ? [modId] : top?.get(r.id) ?? [],
  }));
}

async function profile(db: D1Database, id: number, modLimit: number): Promise<ContributorProfile | null> {
  const user = await db
    .prepare(`SELECT u.id, u.display_name, u.minecraft_name, u.minecraft_uuid, u.minecraft_verified FROM users u WHERE u.id = ? AND ${VISIBLE}`)
    .bind(id)
    .first<ProfileRow>();
  if (!user) return null;
  const { results } = await db
    .prepare(`SELECT mod_id, COUNT(*) AS count FROM suggestions WHERE author_user_id = ? AND status = 'published'
              GROUP BY mod_id ORDER BY count DESC, mod_id`)
    .bind(id)
    .all<{ mod_id: string; count: number }>();
  const published = results.reduce((n, r) => n + r.count, 0);
  if (published === 0) return null;
  return {
    id: user.id, displayName: user.display_name, minecraftName: user.minecraft_name, minecraftUuid: user.minecraft_uuid,
    minecraftVerified: user.minecraft_verified === 1, published,
    mods: results.slice(0, modLimit).map((r) => ({ modId: r.mod_id, count: r.count })),
  };
}

export function createD1Contributors(db: D1Database): ContributorRepo {
  return {
    ranking: ({ modId, limit }) => ranking(db, modId, limit),
    profile: (id, modLimit) => profile(db, id, modLimit),
  };
}
