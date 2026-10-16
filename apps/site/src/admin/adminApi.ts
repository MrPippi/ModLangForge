import { apiGet, apiSend, type ApiResult, type FetchLike } from '../islands/api';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'superseded' | 'conflict' | 'published';
export type Role = 'admin' | 'reviewer' | 'contributor';

export interface AdminSuggestion {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly baseTarget: string | null;
  readonly proposed: string;
  readonly note: string | null;
  readonly formatWarning: boolean;
  readonly status: SuggestionStatus;
  readonly authorUserId: number | null;
  readonly authorName: string | null;
  readonly authorSubject: string;
  readonly reviewNote: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export interface AdminUser {
  readonly id: number;
  readonly displayName: string;
  readonly role: Role;
  readonly banned: boolean;
  readonly isPublic: boolean;
  readonly createdAt: string;
  readonly identities: readonly { readonly provider: string; readonly username: string | null }[];
}

export interface BlockRecord {
  readonly subject: string;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface PendingStatusChange {
  readonly id: number;
  readonly modId: string;
  readonly status: string;
}

export interface PublishSummary {
  readonly approved: number;
  readonly mods: readonly { readonly modId: string; readonly count: number }[];
  readonly statusChanges: readonly PendingStatusChange[];
}

export interface PublishResult {
  readonly commitSha: string | null;
  readonly applied: number;
  readonly conflicts: number;
  readonly superseded: number;
  /** 超出單次批次上限、尚未處理的模組數（實際 publish 路由的回應欄位） */
  readonly remainingMods: number;
}

const query = (params: Record<string, string | undefined>): string =>
  new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== '')).toString();

export function createAdminApi(fetchImpl: FetchLike = fetch) {
  return {
    listSuggestions: (status: SuggestionStatus, modId?: string) =>
      apiGet<{ suggestions: AdminSuggestion[]; truncated?: boolean }>(`/api/v1/admin/suggestions?${query({ status, modId })}`, fetchImpl),
    approve: (id: number, proposed?: string): Promise<ApiResult<{ id: number }>> =>
      apiSend(`/api/v1/admin/suggestions/${id}/approve`, 'POST', proposed === undefined ? {} : { proposed }, fetchImpl),
    reject: (id: number, reason?: string): Promise<ApiResult<{ id: number }>> =>
      apiSend(`/api/v1/admin/suggestions/${id}/reject`, 'POST', reason ? { reason } : {}, fetchImpl),
    directEdit: (modId: string, key: string, proposed: string) =>
      apiSend<{ id: number; formatWarning: boolean }>('/api/v1/admin/edits', 'POST', { modId, key, proposed }, fetchImpl),
    setModStatus: (modId: string, status: 'partial' | 'reviewed') =>
      apiSend<{ id: number }>(`/api/v1/admin/mods/${encodeURIComponent(modId)}/status`, 'POST', { status }, fetchImpl),
    withdrawStatusChange: (id: number) => apiSend<{ id: number }>(`/api/v1/admin/mods/status-changes/${id}`, 'DELETE', undefined, fetchImpl),
    publishSummary: () => apiGet<PublishSummary>('/api/v1/admin/publish', fetchImpl),
    publish: () => apiSend<PublishResult>('/api/v1/admin/publish', 'POST', {}, fetchImpl),
    listUsers: (q: string) => apiGet<{ users: AdminUser[] }>(`/api/v1/admin/users?${query({ q })}`, fetchImpl),
    setRole: (id: number, role: Role) => apiSend<{ id: number; role: Role }>(`/api/v1/admin/users/${id}/role`, 'POST', { role }, fetchImpl),
    setBanned: (id: number, banned: boolean) => apiSend<{ id: number; banned: boolean }>(`/api/v1/admin/users/${id}/ban`, 'POST', { banned }, fetchImpl),
    listBlocks: () => apiGet<{ blocks: BlockRecord[] }>('/api/v1/admin/blocks', fetchImpl),
    addBlock: (subject: string, reason?: string) =>
      apiSend<{ subject: string }>('/api/v1/admin/blocks', 'POST', reason ? { subject, reason } : { subject }, fetchImpl),
    removeBlock: (subject: string) => apiSend<{ removed: boolean }>(`/api/v1/admin/blocks/${encodeURIComponent(subject)}`, 'DELETE', undefined, fetchImpl),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
