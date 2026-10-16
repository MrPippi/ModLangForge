import { z } from 'zod';
import type { PublishFile } from '@mlf/core/review';
import type { FetchLike } from '../appEnv';
import type { Env } from '../env';
import { createAppJwt, importPrivateKey } from './appJwt';

export class GithubError extends Error {
  constructor(readonly status: number, readonly endpoint: string) {
    super(`GitHub ${endpoint} failed with ${status}`);
    this.name = 'GithubError';
  }
}

export interface GithubConfig {
  readonly apiBase: string;
  readonly appId: string;
  readonly privateKeyPem: string;
  readonly installationId: string;
  readonly repo: string;
  readonly fetch: FetchLike;
  readonly now: Date;
}

export interface GithubClient {
  mainSha(): Promise<string>;
  commitTree(sha: string): Promise<string>;
  readFile(path: string, ref: string): Promise<string | null>;
  createTree(baseTree: string, files: readonly PublishFile[]): Promise<string>;
  createCommit(message: string, tree: string, parent: string): Promise<string>;
  fastForwardMain(sha: string): Promise<'ok' | 'not_fast_forward'>;
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH = 'main';
const shaSchema = z.object({ sha: z.string().min(1) });
const messageSchema = z.object({ message: z.string() });

export function githubConfig(env: Env, fetchImpl: FetchLike, now: Date): GithubConfig {
  return {
    apiBase: env.GITHUB_API_BASE, appId: env.GITHUB_APP_ID, privateKeyPem: env.GITHUB_APP_PRIVATE_KEY,
    installationId: env.GITHUB_INSTALLATION_ID, repo: env.REPO, fetch: fetchImpl, now,
  };
}

function headers(token: string, accept = 'application/vnd.github+json'): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'modlangforge', 'X-GitHub-Api-Version': '2022-11-28' };
}

/** 網路層失敗一律轉成 GithubError(0, endpoint)，呼叫端統一對應成 502 */
async function call(cfg: GithubConfig, endpoint: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await cfg.fetch(url, init);
  } catch {
    throw new GithubError(0, endpoint);
  }
}

async function expectJson<T>(res: Response, endpoint: string, schema: z.ZodType<T>): Promise<T> {
  if (!res.ok) throw new GithubError(res.status, endpoint);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new GithubError(res.status, `${endpoint} (unexpected body)`);
  return parsed.data;
}

async function installationToken(cfg: GithubConfig): Promise<string> {
  const jwt = await createAppJwt(cfg.appId, await importPrivateKey(cfg.privateKeyPem), cfg.now);
  const url = `${cfg.apiBase}/app/installations/${encodeURIComponent(cfg.installationId)}/access_tokens`;
  const res = await call(cfg, 'installation token', url, { method: 'POST', headers: headers(jwt) });
  return (await expectJson(res, 'installation token', z.object({ token: z.string().min(1) }))).token;
}

/** 只記錄 GitHub 回的 message 欄位，絕不記錄 token / 金鑰 / JWT */
async function logRefRejection(res: Response): Promise<void> {
  const parsed = messageSchema.safeParse(await res.json().catch(() => null));
  console.error('github ref update rejected', res.status, parsed.success ? parsed.data.message : '(no message)');
}

export async function createGithubClient(cfg: GithubConfig): Promise<GithubClient> {
  if (!REPO_PATTERN.test(cfg.repo)) throw new Error('REPO must be owner/name');
  const token = await installationToken(cfg);
  const base = `${cfg.apiBase}/repos/${cfg.repo}`;
  const send = (path: string, method: string, body: unknown, endpoint: string) =>
    call(cfg, endpoint, `${base}${path}`, { method, headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const getJson = async <T>(path: string, schema: z.ZodType<T>) =>
    expectJson(await call(cfg, path, `${base}${path}`, { headers: headers(token) }), path, schema);

  return {
    async mainSha() {
      return (await getJson(`/git/ref/heads/${BRANCH}`, z.object({ object: shaSchema }))).object.sha;
    },
    async commitTree(sha) {
      return (await getJson(`/git/commits/${sha}`, z.object({ tree: shaSchema }))).tree.sha;
    },
    async readFile(path, ref) {
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      const url = `${base}/contents/${encoded}?ref=${encodeURIComponent(ref)}`;
      const res = await call(cfg, 'contents', url, { headers: headers(token, 'application/vnd.github.raw+json') });
      if (res.status === 404) return null;
      if (!res.ok) throw new GithubError(res.status, 'contents');
      return res.text();
    },
    async createTree(baseTree, files) {
      const tree = files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content }));
      const res = await send('/git/trees', 'POST', { base_tree: baseTree, tree }, 'create tree');
      return (await expectJson(res, 'create tree', shaSchema)).sha;
    },
    async createCommit(message, tree, parent) {
      const res = await send('/git/commits', 'POST', { message, tree, parents: [parent] }, 'create commit');
      return (await expectJson(res, 'create commit', shaSchema)).sha;
    },
    async fastForwardMain(sha) {
      const res = await send(`/git/refs/heads/${BRANCH}`, 'PATCH', { sha, force: false }, 'update ref');
      if (res.ok) return 'ok';
      if (res.status === 422) {
        await logRefRejection(res);
        return 'not_fast_forward';
      }
      throw new GithubError(res.status, 'update ref');
    },
  };
}
