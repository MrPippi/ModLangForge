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
}

export interface FakeGithub {
  readonly fetch: FetchLike;
  head(): string;
  fileAtHead(path: string): string | null;
  commits(): readonly FakeCommit[];
  requests(): readonly { method: string; path: string }[];
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

function readRoutes(store: Store, rest: string, url: URL): Response | null {
  if (rest === '/git/ref/heads/main') return json({ ref: 'refs/heads/main', object: { sha: store.head(), type: 'commit' } });
  const commitPath = /^\/git\/commits\/([0-9a-f]{40})$/.exec(rest);
  if (commitPath) {
    const c = store.commit(commitPath[1] ?? '');
    return c ? json({ sha: c.sha, tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), message: c.message }) : notFound();
  }
  if (rest.startsWith('/contents/')) {
    const path = decodeURIComponent(rest.slice('/contents/'.length));
    const content = store.filesOf(url.searchParams.get('ref') ?? store.head())?.get(path);
    return content === undefined ? notFound() : new Response(content);
  }
  return null;
}

/** 只實作發佈流程用到的 repo 端點 */
function repoRoute(store: Store, updateRef: (body: Body) => Response, method: string, rest: string, url: URL, body: Body): Response {
  if (method === 'GET') return readRoutes(store, rest, url) ?? notFound();
  if (method === 'POST' && rest === '/git/trees') return createTreeRoute(store, body);
  if (method === 'POST' && rest === '/git/commits') return createCommitRoute(store, body);
  if (method === 'PATCH' && rest === '/git/refs/heads/main') return updateRef(body);
  return notFound();
}

const TOKEN_PATH = /^\/app\/installations\/[^/]+\/access_tokens$/;

/** GitHub REST 假實作（測試替身，單元測試與 E2E 共用）；狀態存在閉包內 */
export function createFakeGithub(initial: Readonly<Record<string, string>>, opts: FakeGithubOptions = {}): FakeGithub {
  const prefix = `/repos/${opts.repo ?? 'MrPippi/ModLangForge'}`;
  let store = createStore(initial);
  let log: { method: string; path: string }[] = [];
  let pushesLeft = opts.concurrentPushes ?? 0;

  function updateRef(body: Body): Response {
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
    log.push({ method: req.method, path: url.pathname });
    if (opts.failPath?.test(url.pathname)) return json({ message: 'boom' }, 500);
    const body = (req.method === 'GET' ? null : await req.json().catch(() => null)) as Body;
    if (req.method === 'POST' && TOKEN_PATH.test(url.pathname)) {
      return json({ token: 'ghs_fake', expires_at: '2099-01-01T00:00:00Z' }, 201);
    }
    if (!url.pathname.startsWith(prefix)) return notFound();
    return repoRoute(store, updateRef, req.method, url.pathname.slice(prefix.length), url, body);
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
