// apps/site/src/contributors/contributorsApi.ts
import { MOD_ID_PATTERN } from '@mlf/core/catalog';
import { apiGet, type ApiResult, type FetchLike } from '../islands/api';

export interface ContributorSummary {
  readonly id: number;
  readonly displayName: string;
  readonly minecraftUuid: string | null;
  readonly published: number;
  readonly mods: number;
  readonly topMods: readonly string[];
}

export interface ContributorProfileData {
  readonly id: number;
  readonly displayName: string;
  readonly minecraftName: string | null;
  readonly minecraftUuid: string | null;
  readonly minecraftVerified: boolean;
  readonly published: number;
  readonly mods: readonly { readonly modId: string; readonly count: number }[];
}

export function listContributors(modId: string | null, fetchImpl: FetchLike = fetch): Promise<ApiResult<{ contributors: ContributorSummary[] }>> {
  const path = modId ? `/api/v1/contributors?modId=${encodeURIComponent(modId)}` : '/api/v1/contributors';
  return apiGet<{ contributors: ContributorSummary[] }>(path, fetchImpl);
}

export function getContributor(id: number, fetchImpl: FetchLike = fetch): Promise<ApiResult<{ contributor: ContributorProfileData }>> {
  return apiGet<{ contributor: ContributorProfileData }>(`/api/v1/contributors/${id}`, fetchImpl);
}

/** /contributors/<id>/ → id；格式不符或超出安全整數時回 null */
export function contributorIdFromPath(pathname: string): number | null {
  const match = /^\/contributors\/([1-9]\d{0,15})\/?$/.exec(pathname);
  const id = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(id) ? id : null;
}

/** ?mod= 參數；不合法時回 null */
export function modFilterFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('mod');
  return value !== null && MOD_ID_PATTERN.test(value) ? value : null;
}
