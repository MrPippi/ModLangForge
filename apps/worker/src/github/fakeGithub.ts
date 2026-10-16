import type { FetchLike } from '../appEnv';

export interface FakeCommit {
  readonly sha: string;
  readonly tree: string;
  readonly parents: readonly string[];
  readonly message: string;
}

export interface FakeGithubOptions {
  readonly repo?: string;
  /** 每次更新 ref 前模擬他人先推送一次，共幾次 */
  readonly concurrentPushes?: number;
  /** 路徑符合時回 500 */
  readonly failPath?: RegExp;
  /** 設定時 ref 更新一律回 422 與此訊息（模擬分支保護／ruleset 拒絕） */
  readonly rejectRefUpdate?: string;
}

export interface FakeRequest {
  readonly method: string;
  readonly path: string;
  /** header 名稱為小寫 */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>> | null;
}

export interface FakeGithub {
  readonly fetch: FetchLike;
  head(): string;
  fileAtHead(path: string): string | null;
  commits(): readonly FakeCommit[];
  requests(): readonly FakeRequest[];
  /** 還原成初始檔案、head、請求紀錄與 concurrentPushes（E2E 重試時讓發佈可重複） */
  reset(): void;
}

type Body = Record<string, unknown> | null;
type Files = ReadonlyMap<string, string>;

interface Store {
  head(): string;
  setHead(sha: string): void;
  addTree(files: Files): string;
  addCommit(tree: string, parents: readonly string[], message: string): string;
  commit(sha: string): FakeCommit | undefined;
  tree(sha: string): Files | undefined;
  filesOf(sha: string): Files | null;
  commits(): FakeCommit[];
}

/** 樹與提交的記憶體儲存；每次呼叫都是全新的獨立狀態 */
function createStore(initial: Readonly<Record<string, string>>): Store {
  const trees = new Map<string, Files>();
  const commits = new Map<string, FakeCommit>();
  let counter = 0;
  const nextSha = () => (counter += 1).toString(16).padStart(40, '0');
  const addTree = (files: Files) => { const sha = nextSha(); trees.set(sha, files); return sha; };
  const addCommit = (tree: string, parents: readonly string[], message: string) => {
    const sha = nextSha();
    commits.set(sha, { sha, tree, parents, message });
    return sha;
  };
  let head = addCommit(addTree(new Map(Object.entries(initial))), [], 'initial');
  return {
    head: () => head,
    setHead: (sha) => { head = sha; },
    addTree,
    addCommit,
    commit: (sha) => commits.get(sha),
    tree: (sha) => trees.get(sha),
    filesOf: (sha) => trees.get(commits.get(sha)?.tree ?? '') ?? null,
    commits: () => [...commits.values()],
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const notFound = () => json({ message: 'Not Found' }, 404);

function createTreeRoute(store: Store, body: Body): Response {
  const base = store.tree(String(body?.base_tree));
  if (!base) return json({ message: 'base_tree not found' }, 422);
  const entries = (body?.tree as { path: string; content: string }[] | undefined) ?? [];
  return json({ sha: store.addTree(new Map([...base, ...entries.map((e) => [e.path, e.content] as const)])) }, 201);
}

function createCommitRoute(store: Store, body: Body): Response {
  if (!store.tree(String(body?.tree))) return json({ message: 'tree not found' }, 422);
  const parents = (body?.parents as string[] | undefined) ?? [];
  return json({ sha: store.addCommit(String(body?.tree), parents, String(body?.message)) }, 201);
}

const RAW = 'application/vnd.github.raw+json';

/** 與 GitHub 相同：沒有 raw Accept 時回 base64 的 JSON 包裝，而不是檔案內容 */
function contentsRoute(content: string, accept: string | null): Response {
  if (accept === RAW) return new Response(content);
  return json({ type: 'file', encoding: 'base64', content: btoa(String.fromCharCode(...new TextEncoder().encode(content))) });
}

function readRoutes(store: Store, rest: string, url: URL, accept: string | null): Response | null {
  if (rest === '/git/ref/heads/main') return json({ ref: 'refs/heads/main', object: { sha: store.head(), type: 'commit' } });
  const commitPath = /^\/git\/commits\/([0-9a-f]{40})$/.exec(rest);
  if (commitPath) {
    const c = store.commit(commitPath[1] ?? '');
    return c ? json({ sha: c.sha, tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), message: c.message }) : notFound();
  }
  if (rest.startsWith('/contents/')) {
    const path = decodeURIComponent(rest.slice('/contents/'.length));
    const content = store.filesOf(url.searchParams.get('ref') ?? store.head())?.get(path);
    return content === undefined ? notFound() : contentsRoute(content, accept);
  }
  return null;
}

/** 只實作發佈流程用到的 repo 端點 */
function repoRoute(store: Store, updateRef: (body: Body) => Response, req: Request, rest: string, url: URL, body: Body): Response {
  const method = req.method;
  if (method === 'GET') return readRoutes(store, rest, url, req.headers.get('Accept')) ?? notFound();
  if (method === 'POST' && rest === '/git/trees') return createTreeRoute(store, body);
  if (method === 'POST' && rest === '/git/commits') return createCommitRoute(store, body);
  if (method === 'PATCH' && rest === '/git/refs/heads/main') return updateRef(body);
  return notFound();
}

const TOKEN_PATH = /^\/app\/installations\/[^/]+\/access_tokens$/;
const JWT = /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/;
const FAKE_TOKEN = 'ghs_fake';

/** token 端點要 App JWT，其他端點要安裝 token */
function authorized(req: Request, tokenRoute: boolean): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  return tokenRoute ? JWT.test(auth) : auth === `Bearer ${FAKE_TOKEN}`;
}

/** GitHub REST 假實作（測試替身，單元測試與 E2E 共用）；狀態存在閉包內 */
export function createFakeGithub(initial: Readonly<Record<string, string>>, opts: FakeGithubOptions = {}): FakeGithub {
  const prefix = `/repos/${opts.repo ?? 'MrPippi/ModLangForge'}`;
  let store = createStore(initial);
  let log: FakeRequest[] = [];
  let pushesLeft = opts.concurrentPushes ?? 0;

  function updateRef(body: Body): Response {
    if (body?.force !== false) return json({ message: 'force must be false' }, 400);
    if (opts.rejectRefUpdate !== undefined) return json({ message: opts.rejectRefUpdate }, 422);
    if (pushesLeft > 0) {
      pushesLeft -= 1;
      store.setHead(store.addCommit(store.commit(store.head())?.tree ?? '', [store.head()], 'concurrent push'));
    }
    const target = store.commit(String(body?.sha));
    if (!target || target.parents[0] !== store.head()) return json({ message: 'Update is not a fast forward' }, 422);
    store.setHead(target.sha);
    return json({ ref: 'refs/heads/main', object: { sha: target.sha } });
  }

  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const body = (req.method === 'GET' ? null : await req.json().catch(() => null)) as Body;
    log.push({ method: req.method, path: url.pathname, headers: Object.fromEntries(req.headers), body });
    if (opts.failPath?.test(url.pathname)) return json({ message: 'boom' }, 500);
    const tokenRoute = req.method === 'POST' && TOKEN_PATH.test(url.pathname);
    if (!authorized(req, tokenRoute)) return json({ message: 'Bad credentials' }, 401);
    if (tokenRoute) return json({ token: FAKE_TOKEN, expires_at: '2099-01-01T00:00:00Z' }, 201);
    if (!url.pathname.startsWith(prefix)) return notFound();
    return repoRoute(store, updateRef, req, url.pathname.slice(prefix.length), url, body);
  }

  return {
    fetch: handle,
    head: () => store.head(),
    fileAtHead: (path) => store.filesOf(store.head())?.get(path) ?? null,
    commits: () => store.commits(),
    requests: () => [...log],
    reset() {
      store = createStore(initial);
      log = [];
      pushesLeft = opts.concurrentPushes ?? 0;
    },
  };
}
