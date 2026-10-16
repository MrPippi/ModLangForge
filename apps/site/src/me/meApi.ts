import { apiGet, apiSend, resetMe, type ApiResult, type FetchLike } from '../islands/api';

export interface UserProfile {
  readonly id: number;
  readonly displayName: string;
  readonly isPublic: boolean;
  readonly minecraftName: string | null;
  readonly minecraftUuid: string | null;
  readonly minecraftVerified: boolean;
}

export type ProfileResult = ApiResult<{ profile: UserProfile }>;

/** 個人資料變更後發出；AccountMenu 監聽並重新載入右上角名稱 */
export const ME_CHANGED_EVENT = 'mlf:me-changed';

function announce(result: ProfileResult): ProfileResult {
  if (result.ok) {
    resetMe();
    window.dispatchEvent(new Event(ME_CHANGED_EVENT));
  }
  return result;
}

export function createMeApi(fetchImpl: FetchLike = fetch) {
  return {
    profile: (): Promise<ProfileResult> => apiGet<{ profile: UserProfile }>('/api/v1/me/profile', fetchImpl),
    updateProfile: async (patch: { readonly displayName?: string; readonly isPublic?: boolean }): Promise<ProfileResult> =>
      announce(await apiSend<{ profile: UserProfile }>('/api/v1/me/profile', 'POST', patch, fetchImpl)),
    setMinecraft: async (name: string | null): Promise<ProfileResult> =>
      announce(await apiSend<{ profile: UserProfile }>('/api/v1/me/minecraft', 'POST', { name }, fetchImpl)),
  };
}

export type MeApi = ReturnType<typeof createMeApi>;
