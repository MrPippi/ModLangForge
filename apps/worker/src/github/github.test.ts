import { createPrivateKey, verify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_GITHUB_KEY, TEST_GITHUB_PUBLIC_KEY, testEnv } from '../testEnv';
import { createAppJwt, importPrivateKey } from './appJwt';
import { ACCEPT_JSON, ACCEPT_RAW, createGithubClient, GITHUB_API_VERSION, GithubError, githubConfig, USER_AGENT, type GithubConfig } from './client';
import { createFakeGithub } from './fakeGithub';
import { pemToPkcs8Der } from './pem';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const FILE = 'data/mods/create/zh_tw.json';
const FILES = { [FILE]: '{\n  "a": "蘋果"\n}\n' };
const config = (fetchImpl: GithubConfig['fetch']): GithubConfig => ({
  apiBase: 'https://api.github.test', appId: '1', privateKeyPem: TEST_GITHUB_KEY, installationId: '99', repo: 'MrPippi/ModLangForge', fetch: fetchImpl, now: NOW,
});
const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

afterEach(() => vi.restoreAllMocks());

describe('pemToPkcs8Der', () => {
  it('wraps PKCS#1 exactly like OpenSSL', () => {
    const expected = createPrivateKey(TEST_GITHUB_KEY).export({ type: 'pkcs8', format: 'der' });
    expect(Buffer.from(pemToPkcs8Der(TEST_GITHUB_KEY))).toEqual(expected);
  });

  it('accepts PKCS#8 and single-line PEM with escaped newlines', () => {
    const pkcs8 = createPrivateKey(TEST_GITHUB_KEY).export({ type: 'pkcs8', format: 'pem' }).toString();
    const expected = createPrivateKey(TEST_GITHUB_KEY).export({ type: 'pkcs8', format: 'der' });
    expect(Buffer.from(pemToPkcs8Der(pkcs8))).toEqual(expected);
    expect(Buffer.from(pemToPkcs8Der(TEST_GITHUB_KEY.trim().replace(/\n/g, '\\n')))).toEqual(expected);
  });

  it('rejects anything else, including an empty PEM body', () => {
    expect(() => pemToPkcs8Der('not a key')).toThrow();
    expect(() => pemToPkcs8Der('-----BEGIN PRIVATE KEY-----\n \n-----END PRIVATE KEY-----')).toThrow();
  });

  it('encodes long-form DER lengths for large and short PKCS#1 bodies', () => {
    const pem = (n: number) => `-----BEGIN RSA PRIVATE KEY-----\n${Buffer.alloc(n, 1).toString('base64')}\n-----END RSA PRIVATE KEY-----`;
    expect(pemToPkcs8Der(pem(10))[1]).toBeLessThan(0x80);
    expect(pemToPkcs8Der(pem(300))[1]).toBe(0x82);
  });
});

describe('createAppJwt', () => {
  it('signs an RS256 JWT GitHub accepts', async () => {
    const jwt = await createAppJwt('1', await importPrivateKey(TEST_GITHUB_KEY), NOW);
    const [header, payload, signature] = jwt.split('.');
    expect(decode(header!)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const iat = Math.floor(NOW.getTime() / 1000) - 60;
    expect(decode(payload!)).toEqual({ iat, exp: iat + 540, iss: '1' });
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), TEST_GITHUB_PUBLIC_KEY, Buffer.from(signature!, 'base64url'))).toBe(true);
  });
});

describe('githubConfig', () => {
  it('maps env to config', () => {
    const cfg = githubConfig(testEnv(), fetch, NOW);
    expect(cfg).toMatchObject({ apiBase: 'https://api.github.test', appId: '1', installationId: '99', repo: 'MrPippi/ModLangForge', now: NOW });
  });
});

describe('GitHub client against the fake', () => {
  it('reads, commits and fast-forwards main', async () => {
    const fake = createFakeGithub(FILES);
    const gh = await createGithubClient(config(fake.fetch));
    const base = await gh.mainSha();
    expect(await gh.readFile(FILE, base)).toBe(FILES[FILE]);
    expect(await gh.readFile('data/mods/nope/zh_tw.json', base)).toBeNull();
    const tree = await gh.createTree(await gh.commitTree(base), [{ path: FILE, content: '{}\n' }]);
    const commit = await gh.createCommit('msg', tree, base);
    expect(await gh.fastForwardMain(commit)).toBe('ok');
    expect(fake.head()).toBe(commit);
    expect(fake.fileAtHead(FILE)).toBe('{}\n');
    expect(fake.requests()[0]).toMatchObject({ method: 'POST', path: '/app/installations/99/access_tokens' });
  });

  it('sends the production headers on every request and a non-forced ref update', async () => {
    const fake = createFakeGithub(FILES);
    const gh = await createGithubClient(config(fake.fetch));
    const base = await gh.mainSha();
    await gh.readFile(FILE, base);
    const commit = await gh.createCommit('msg', await gh.commitTree(base), base);
    await gh.fastForwardMain(commit);
    const requests = fake.requests();
    for (const r of requests) {
      expect(r.headers['user-agent']).toBe(USER_AGENT);
      expect(r.headers['x-github-api-version']).toBe(GITHUB_API_VERSION);
      expect(r.headers.authorization).toMatch(/^Bearer \S+$/);
    }
    expect(USER_AGENT).toBe('modlangforge');
    expect(GITHUB_API_VERSION).toBe('2022-11-28');
    const contents = requests.filter((r) => r.path.includes('/contents/'));
    expect(contents.map((r) => r.headers.accept)).toEqual([ACCEPT_RAW]);
    expect(ACCEPT_RAW).toBe('application/vnd.github.raw+json');
    expect(requests.filter((r) => !r.path.includes('/contents/')).every((r) => r.headers.accept === ACCEPT_JSON)).toBe(true);
    const patch = requests.find((r) => r.method === 'PATCH');
    expect(patch?.body).toEqual({ sha: commit, force: false });
  });

  it('throws GithubError(422) for ref rejections that are not fast-forward failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = createFakeGithub(FILES, { rejectRefUpdate: 'Required status check "ci" is expected.' });
    const gh = await createGithubClient(config(fake.fetch));
    const base = await gh.mainSha();
    const commit = await gh.createCommit('msg', await gh.commitTree(base), base);
    await expect(gh.fastForwardMain(commit)).rejects.toMatchObject({ name: 'GithubError', status: 422, endpoint: 'update ref' });
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('Required status check');
  });

  it('reports a non-fast-forward when main moved, logging only the message', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = createFakeGithub(FILES, { concurrentPushes: 1 });
    const gh = await createGithubClient(config(fake.fetch));
    const base = await gh.mainSha();
    const commit = await gh.createCommit('msg', await gh.commitTree(base), base);
    expect(await gh.fastForwardMain(commit)).toBe('not_fast_forward');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain('not a fast forward');
    expect(logged).not.toContain('ghs_fake');
  });

  it('throws GithubError on failures', async () => {
    const fake = createFakeGithub(FILES, { failPath: /access_tokens/ });
    await expect(createGithubClient(config(fake.fetch))).rejects.toBeInstanceOf(GithubError);
    await expect(createGithubClient({ ...config(fake.fetch), repo: 'not a repo' })).rejects.toThrow();
  });

  it('throws GithubError on a non-404 read failure', async () => {
    const fake = createFakeGithub(FILES, { failPath: /\/contents\// });
    const gh = await createGithubClient(config(fake.fetch));
    await expect(gh.readFile(FILE, await gh.mainSha())).rejects.toMatchObject({ name: 'GithubError', status: 500 });
  });

  it('throws GithubError on an unexpected response body', async () => {
    const fake = createFakeGithub(FILES);
    const bad: GithubConfig['fetch'] = async (input, init) => {
      const res = await fake.fetch(input, init);
      return new URL(String(input)).pathname.includes('/git/ref/') ? Response.json({}) : res;
    };
    const gh = await createGithubClient(config(bad));
    await expect(gh.mainSha()).rejects.toBeInstanceOf(GithubError);
  });

  it('maps a network rejection to GithubError(0, endpoint)', async () => {
    const down: GithubConfig['fetch'] = async () => { throw new TypeError('network down'); };
    const err = await createGithubClient(config(down)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GithubError);
    expect(err).toMatchObject({ status: 0 });
  });

  it('throws GithubError when updating the ref fails with a non-422 status', async () => {
    const fake = createFakeGithub(FILES, { failPath: /\/git\/refs\// });
    const gh = await createGithubClient(config(fake.fetch));
    await expect(gh.fastForwardMain('0'.repeat(40))).rejects.toMatchObject({ status: 500 });
  });
});

describe('fake GitHub', () => {
  it('reset restores the initial files, head and counters', async () => {
    const fake = createFakeGithub(FILES, { concurrentPushes: 1 });
    const initialHead = fake.head();
    const gh = await createGithubClient(config(fake.fetch));
    const base = await gh.mainSha();
    const tree = await gh.createTree(await gh.commitTree(base), [{ path: FILE, content: 'x' }]);
    await gh.fastForwardMain(await gh.createCommit('m', tree, base));
    fake.reset();
    expect(fake.head()).toBe(initialHead);
    expect(fake.fileAtHead(FILE)).toBe(FILES[FILE]);
    expect(fake.requests()).toEqual([]);
    const again = await createGithubClient(config(fake.fetch));
    const b2 = await again.mainSha();
    const c2 = await again.createCommit('m', await again.commitTree(b2), b2);
    expect(await again.fastForwardMain(c2)).toBe('not_fast_forward');
  });

  it('enforces authorization, the raw Accept header and force:false like production', async () => {
    const fake = createFakeGithub(FILES);
    const api = 'https://api.github.test';
    const repo = `${api}/repos/MrPippi/ModLangForge`;
    const auth = { Authorization: 'Bearer ghs_fake' };
    expect((await fake.fetch(`${repo}/git/ref/heads/main`)).status).toBe(401);
    expect((await fake.fetch(`${api}/app/installations/99/access_tokens`, { method: 'POST', headers: auth })).status).toBe(401);
    const raw = await fake.fetch(`${repo}/contents/${FILE}`, { headers: { ...auth, Accept: ACCEPT_RAW } });
    expect(await raw.text()).toBe(FILES[FILE]);
    const envelope = await fake.fetch(`${repo}/contents/${FILE}`, { headers: { ...auth, Accept: ACCEPT_JSON } });
    expect(await envelope.json()).toMatchObject({ type: 'file', encoding: 'base64', content: Buffer.from(FILES[FILE]).toString('base64') });
    const sha = fake.head();
    for (const body of [{ sha }, { sha, force: true }]) {
      const res = await fake.fetch(`${repo}/git/refs/heads/main`, { method: 'PATCH', headers: auth, body: JSON.stringify(body) });
      expect(res.status).toBe(400);
    }
  });

  it('rejects bad trees, commits and unknown routes', async () => {
    const fake = createFakeGithub(FILES);
    const gh = await createGithubClient(config(fake.fetch));
    await expect(gh.createTree('f'.repeat(40), [])).rejects.toBeInstanceOf(GithubError);
    await expect(gh.createCommit('m', 'f'.repeat(40), 'f'.repeat(40))).rejects.toBeInstanceOf(GithubError);
    await expect(gh.commitTree('f'.repeat(40))).rejects.toBeInstanceOf(GithubError);
    expect((await fake.fetch('https://api.github.test/unknown', { headers: { Authorization: 'Bearer ghs_fake' } })).status).toBe(404);
  });
});
