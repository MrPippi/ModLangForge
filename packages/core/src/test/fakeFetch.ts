import type { FetchInit, FetchLike, FetchResponse } from '../modpackImport/http';

export interface FetchCall {
  readonly url: string;
  readonly init?: FetchInit;
}

export type FakeFetch = FetchLike & { readonly calls: readonly FetchCall[] };

function respond(body: unknown): FetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    arrayBuffer: async () => {
      if (!(body instanceof Uint8Array)) throw new Error('route is not a file');
      return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    },
  };
}

const NOT_FOUND: FetchResponse = { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };

/** 測試用：依網址回傳固定內容（Uint8Array 代表下載檔），其他網址回 404；記錄每次呼叫 */
export function fakeFetch(routes: Readonly<Record<string, unknown>>): FakeFetch {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string, init?: FetchInit): Promise<FetchResponse> => {
    calls.push(init ? { url, init } : { url });
    return Object.hasOwn(routes, url) ? respond(routes[url]) : NOT_FOUND;
  };
  return Object.assign(fetchImpl, { calls });
}
