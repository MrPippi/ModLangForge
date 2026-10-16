// 單元測試與 E2E（e2e/fake-github.ts 轉送）共用的假 Mojang
import type { FetchLike } from '../appEnv';

export interface FakeMojangProfile {
  readonly id: string;
  readonly name: string;
}

/** 名稱（小寫）→ 個人資料；名稱 ratelimited 回 429、broken 回 500 */
export const FAKE_MOJANG_PROFILES: Readonly<Record<string, FakeMojangProfile>> = {
  steve: { id: '8667ba71b85a4004af54457a9734eed7', name: 'Steve' },
  alex: { id: 'ec561538f3fd461daff5086b22154bce', name: 'Alex' },
  // 僅假伺服器有；真 Mojang 會回 404，E2E 若誤連真服務會直接失敗
  mlf_e2e: { id: '0123456789abcdef0123456789abcdef', name: 'MLF_E2E' },
};

const PATH = /^\/users\/profiles\/minecraft\/([^/]+)$/;

export function isMojangPath(pathname: string): boolean {
  return PATH.test(pathname);
}

interface LoggedRequest {
  readonly url: string;
  readonly userAgent: string | null;
  /** 小寫、排序後的外送標頭名稱（隱私斷言用） */
  readonly headerNames: readonly string[];
}

export function createFakeMojang(profiles: Readonly<Record<string, FakeMojangProfile>> = FAKE_MOJANG_PROFILES) {
  const log: LoggedRequest[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    log.push({ url, userAgent: headers.get('User-Agent'), headerNames: [...headers.keys()].sort() });
    const pathname = new URL(url).pathname;
    const name = decodeURIComponent(PATH.exec(pathname)?.[1] ?? '').toLowerCase();
    if (name === 'ratelimited') return new Response(null, { status: 429 });
    if (name === 'broken') return new Response('oops', { status: 500 });
    const profile = Object.hasOwn(profiles, name) ? profiles[name] : undefined;
    return profile
      ? Response.json(profile)
      : Response.json({ path: pathname, errorMessage: `Couldn't find any profile with name ${name}` }, { status: 404 });
  };
  return { fetch, requests: (): readonly LoggedRequest[] => [...log] };
}
