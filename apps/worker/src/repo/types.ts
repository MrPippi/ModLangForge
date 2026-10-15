import type { LoginProvider, Role, SuggestionStatus } from '@mlf/core/review';

export interface NewSuggestion {
  readonly modId: string;
  readonly key: string;
  readonly baseTarget: string | null;
  readonly proposed: string;
  readonly note: string | null;
  readonly formatWarning: boolean;
  readonly authorUserId: number | null;
  readonly authorHash: string;
  readonly createdAt: string;
}

export interface StoredSuggestion extends NewSuggestion {
  readonly id: number;
  readonly status: 'pending';
}

export type AuthorRef = { readonly userId: number } | { readonly hash: string };

export interface MySuggestion {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly proposed: string;
  readonly status: SuggestionStatus;
  readonly reviewNote: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

/** rate_events 保留 24 小時，寫入新事件時順便清除更舊的列 */
export const RATE_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface SuggestionRepo {
  /** 同主體（authorUserId ?? authorHash）對同 mod/key 已有 pending 時覆蓋該列，否則新增；單一交易 */
  upsertPending(s: NewSuggestion): Promise<StoredSuggestion>;
  /** 原子操作：視窗內未達上限才記錄一次並回傳 true */
  tryConsumeRate(subject: string, at: Date, limit: number, windowMs: number): Promise<boolean>;
  listByAuthor(author: AuthorRef, limit: number): Promise<MySuggestion[]>;
}

export interface BlockRecord {
  readonly subject: string;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface BlockRepo {
  isBlocked(subjects: readonly string[]): Promise<boolean>;
  list(limit: number): Promise<BlockRecord[]>;
  /** 已存在時只更新理由 */
  add(subject: string, reason: string | null, nowIso: string): Promise<void>;
  remove(subject: string): Promise<boolean>;
}

export interface Repos {
  readonly suggestions: SuggestionRepo;
  readonly blocks: BlockRepo;
  readonly users: UserRepo;
}

export interface UserRecord { id: number; displayName: string; role: Role; isPublic: boolean; banned: boolean; sessionVersion: number; createdAt: string }
export interface NewIdentity { provider: LoginProvider; providerUserId: string; username: string | null }
export interface IdentityRecord extends NewIdentity { linkedAt: string }
export interface AdminUserView { id: number; displayName: string; role: Role; banned: boolean; isPublic: boolean; createdAt: string; identities: readonly { provider: string; username: string | null }[] }
export type LinkOutcome = 'linked' | 'already' | 'taken' | 'provider_linked';
export interface UserRepo {
  findById(id: number): Promise<UserRecord | null>;
  findByIdentity(provider: LoginProvider, providerUserId: string): Promise<UserRecord | null>;
  create(input: { displayName: string; role: Role; identity: NewIdentity; now: string }): Promise<UserRecord>;
  linkIdentity(userId: number, identity: NewIdentity, now: string): Promise<LinkOutcome>;
  listIdentities(userId: number): Promise<IdentityRecord[]>;
  search(query: string, limit: number): Promise<AdminUserView[]>;
  /** 同時遞增 session_version */
  setRole(id: number, role: Role): Promise<UserRecord | null>;
  /** 同時遞增 session_version */
  setBanned(id: number, banned: boolean): Promise<UserRecord | null>;
}
