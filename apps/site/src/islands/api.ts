export type ApiResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly code: string; readonly message: string };
export type FetchLike = (input: string, init?: RequestInit) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

export interface MeUser {
  readonly id: number;
  readonly displayName: string;
  readonly role: 'admin' | 'reviewer' | 'contributor';
  readonly identities: readonly { readonly provider: string; readonly username: string | null }[];
}

export interface Me {
  readonly user: MeUser | null;
  readonly csrfToken: string;
}

const NETWORK_ERROR: ApiResult<never> = { ok: false, code: 'network', message: '連線失敗，請檢查網路後再試。' };
const UNKNOWN_MESSAGE = '操作失敗，請稍後再試。';

interface Envelope<T> {
  readonly ok?: boolean;
  readonly data?: T;
  readonly error?: { readonly code?: string; readonly message?: string };
}

async function request<T>(fetchImpl: FetchLike, path: string, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const body = (await (await fetchImpl(path, { credentials: 'same-origin', ...init })).json()) as Envelope<T>;
    if (body.ok === true && body.data !== undefined) return { ok: true, data: body.data };
    return { ok: false, code: body.error?.code ?? 'unknown', message: body.error?.message ?? UNKNOWN_MESSAGE };
  } catch {
    return NETWORK_ERROR;
  }
}

export function apiGet<T>(path: string, fetchImpl: FetchLike = fetch): Promise<ApiResult<T>> {
  return request<T>(fetchImpl, path, {});
}

let meCache: Promise<ApiResult<Me>> | null = null;

/** 目前使用者與 CSRF token；成功結果在頁面生命週期內快取 */
export function loadMe(fetchImpl: FetchLike = fetch): Promise<ApiResult<Me>> {
  const pending = meCache ?? apiGet<Me>('/api/v1/me', fetchImpl);
  meCache = pending;
  return pending.then((result) => {
    if (!result.ok && meCache === pending) meCache = null;
    return result;
  });
}

export function resetMe(): void {
  meCache = null;
}

export async function apiSend<T>(path: string, method: 'POST' | 'DELETE', body?: unknown, fetchImpl: FetchLike = fetch): Promise<ApiResult<T>> {
  const me = await loadMe(fetchImpl);
  if (!me.ok) return me;
  return request<T>(fetchImpl, path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.data.csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
