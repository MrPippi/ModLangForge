import type { LoginProvider, Role } from '@mlf/core/review';
import type { AdminUserView, IdentityRecord, LinkOutcome, NewIdentity, UserRecord, UserRepo } from './types';

const FIELDS = ['id', 'display_name', 'role', 'public', 'banned', 'session_version', 'created_at'] as const;
const COLUMNS = FIELDS.join(', ');
const U_COLUMNS = FIELDS.map((f) => `u.${f}`).join(', ');

interface UserRow {
  readonly id: number;
  readonly display_name: string;
  readonly role: Role;
  readonly public: number;
  readonly banned: number;
  readonly session_version: number;
  readonly created_at: string;
}

const toUser = (r: UserRow): UserRecord => ({
  id: r.id, displayName: r.display_name, role: r.role, isPublic: r.public === 1,
  banned: r.banned === 1, sessionVersion: r.session_version, createdAt: r.created_at,
});

/** LIKE 以 ! 跳脫 % 與 _ */
const likePattern = (q: string): string => `%${q.replace(/[!%_]/g, (m) => `!${m}`)}%`;

function finders(db: D1Database) {
  return {
    async findById(id: number): Promise<UserRecord | null> {
      const row = await db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).bind(id).first<UserRow>();
      return row ? toUser(row) : null;
    },
    async findByIdentity(provider: LoginProvider, providerUserId: string): Promise<UserRecord | null> {
      const row = await db
        .prepare(`SELECT ${U_COLUMNS} FROM users u JOIN identities i ON i.user_id = u.id WHERE i.provider = ? AND i.provider_user_id = ?`)
        .bind(provider, providerUserId)
        .first<UserRow>();
      return row ? toUser(row) : null;
    },
  };
}

/** 單一語句原子插入；未插入時再查詢以判定原因 */
async function linkIdentity(db: D1Database, userId: number, identity: NewIdentity, now: string): Promise<LinkOutcome> {
  const result = await db
    .prepare(`INSERT INTO identities (provider, provider_user_id, user_id, username, linked_at)
              SELECT ?1, ?2, ?3, ?4, ?5
              WHERE NOT EXISTS (SELECT 1 FROM identities WHERE user_id = ?3 AND provider = ?1)
              ON CONFLICT DO NOTHING`)
    .bind(identity.provider, identity.providerUserId, userId, identity.username, now)
    .run();
  if (result.meta.changes === 1) return 'linked';
  const owner = await db
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?')
    .bind(identity.provider, identity.providerUserId)
    .first<{ user_id: number }>();
  if (owner) return owner.user_id === userId ? 'already' : 'taken';
  return 'provider_linked';
}

async function search(db: D1Database, query: string, limit: number): Promise<AdminUserView[]> {
  const { results } = await db
    .prepare(`SELECT ${U_COLUMNS},
                (SELECT json_group_array(json_object('provider', i.provider, 'username', i.username)) FROM identities i WHERE i.user_id = u.id) AS identities
              FROM users u
              WHERE ?1 = '' OR u.display_name LIKE ?2 ESCAPE '!'
                 OR EXISTS (SELECT 1 FROM identities i2 WHERE i2.user_id = u.id AND i2.username LIKE ?2 ESCAPE '!')
              ORDER BY u.id LIMIT ?3`)
    .bind(query, likePattern(query), limit)
    .all<UserRow & { identities: string }>();
  return results.map((r) => {
    const { sessionVersion: _sv, ...user } = toUser(r);
    return { ...user, identities: JSON.parse(r.identities) as AdminUserView['identities'] };
  });
}

export function createD1Users(db: D1Database): UserRepo {
  const { findById, findByIdentity } = finders(db);
  const update = async (sql: string, ...args: unknown[]): Promise<UserRecord | null> => {
    const row = await db.prepare(`${sql} RETURNING ${COLUMNS}`).bind(...args).first<UserRow>();
    return row ? toUser(row) : null;
  };
  return {
    findById,
    findByIdentity,
    async create({ displayName, role, identity, now }) {
      try {
        await db.batch([
          db.prepare('INSERT INTO users (display_name, role, created_at) VALUES (?, ?, ?)').bind(displayName, role, now),
          db.prepare('INSERT INTO identities (provider, provider_user_id, user_id, username, linked_at) VALUES (?, ?, last_insert_rowid(), ?, ?)')
            .bind(identity.provider, identity.providerUserId, identity.username, now),
        ]);
      } catch (err) {
        // 同一身分同時首次登入：交易整批回滾，改取已建立者
        const existing = await findByIdentity(identity.provider, identity.providerUserId);
        if (existing) return existing;
        throw err;
      }
      const created = await findByIdentity(identity.provider, identity.providerUserId);
      if (!created) throw new Error('created user not found');
      return created;
    },
    linkIdentity: (userId, identity, now) => linkIdentity(db, userId, identity, now),
    async listIdentities(userId): Promise<IdentityRecord[]> {
      const { results } = await db
        .prepare('SELECT provider, provider_user_id, username, linked_at FROM identities WHERE user_id = ? ORDER BY linked_at, provider')
        .bind(userId)
        .all<{ provider: LoginProvider; provider_user_id: string; username: string | null; linked_at: string }>();
      return results.map((r) => ({ provider: r.provider, providerUserId: r.provider_user_id, username: r.username, linkedAt: r.linked_at }));
    },
    search: (query, limit) => search(db, query, limit),
    setRole: (id, role) => update('UPDATE users SET role = ?, session_version = session_version + 1 WHERE id = ?', role, id),
    setBanned: (id, banned) => update('UPDATE users SET banned = ?, session_version = session_version + 1 WHERE id = ?', banned ? 1 : 0, id),
  };
}
