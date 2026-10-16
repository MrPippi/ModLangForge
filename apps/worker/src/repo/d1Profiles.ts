import type { UserProfile, UserRepo } from './types';

const PROFILE_COLUMNS = 'id, display_name, public, minecraft_name, minecraft_uuid, minecraft_verified';

interface ProfileRow {
  readonly id: number;
  readonly display_name: string;
  readonly public: number;
  readonly minecraft_name: string | null;
  readonly minecraft_uuid: string | null;
  readonly minecraft_verified: number;
}

const toProfile = (r: ProfileRow): UserProfile => ({
  id: r.id, displayName: r.display_name, isPublic: r.public === 1,
  minecraftName: r.minecraft_name, minecraftUuid: r.minecraft_uuid, minecraftVerified: r.minecraft_verified === 1,
});

export function profileActions(db: D1Database): Pick<UserRepo, 'getProfile' | 'updateProfile' | 'setMinecraft'> {
  const one = async (sql: string, ...args: unknown[]): Promise<UserProfile | null> => {
    const row = await db.prepare(sql).bind(...args).first<ProfileRow>();
    return row ? toProfile(row) : null;
  };
  return {
    getProfile: (id) => one(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = ?`, id),
    updateProfile: (id, patch) => one(
      `UPDATE users SET display_name = COALESCE(?2, display_name), public = COALESCE(?3, public) WHERE id = ?1 RETURNING ${PROFILE_COLUMNS}`,
      id, patch.displayName ?? null, patch.isPublic === undefined ? null : patch.isPublic ? 1 : 0,
    ),
    setMinecraft: (id, profile) => one(
      `UPDATE users SET minecraft_name = ?2, minecraft_uuid = ?3, minecraft_verified = 0 WHERE id = ?1 RETURNING ${PROFILE_COLUMNS}`,
      id, profile?.name ?? null, profile?.uuid ?? null,
    ),
  };
}
