// 僅測試使用
import { vi } from 'vitest';

type Handler = (url: string, init?: RequestInit) => unknown;
type Reply = { ok: boolean; status: number; json(): Promise<unknown> };

export const envelope = (data: unknown): Reply => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) });
export const failure = (code: string, message: string, status = 400): Reply => ({ ok: false, status, json: async () => ({ ok: false, error: { code, message } }) });

export const ADMIN_ME = { user: { id: 1, displayName: '管理員', role: 'admin', identities: [] }, csrfToken: 'csrf' };
export const REVIEWER_ME = { user: { id: 2, displayName: '審核者', role: 'reviewer', identities: [] }, csrfToken: 'csrf' };

const isReply = (v: unknown): v is Reply => typeof v === 'object' && v !== null && 'json' in v && 'status' in v;

/** 依 `METHOD /path`（不含 query）路由；未列出的路徑回 404 envelope；/api/v1/me 回傳 me */
export function routeFetch(routes: Readonly<Record<string, Handler>>, me: unknown = ADMIN_ME) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Reply> => {
    const path = url.split('?')[0] ?? url;
    if (path === '/api/v1/me') return envelope(me);
    const route = `${init?.method ?? 'GET'} ${path}`;
    if (!Object.hasOwn(routes, route)) return failure('not_found', `no route ${route}`, 404);
    const result = routes[route]?.(url, init);
    return isReply(result) ? result : envelope(result);
  });
}
