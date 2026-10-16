import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { createFakeGithub } from '../apps/worker/src/github/fakeGithub';
import { createFakeMojang, isMojangPath } from '../apps/worker/src/mojang/fakeMojang';

const PORT = Number(process.env.FAKE_GITHUB_PORT ?? 8788);
const MOD_FILES = ['en_us.json', 'zh_tw.json', 'mod.json'];

const files = Object.fromEntries(
  readdirSync('data/mods').flatMap((modId) =>
    MOD_FILES.map((f) => [`data/mods/${modId}/${f}`, readFileSync(join('data/mods', modId, f), 'utf8')] as const)),
);
const fake = createFakeGithub(files);
const mojang = createFakeMojang();

async function readBody(req: AsyncIterable<unknown>): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/__state') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ head: fake.head(), commits: fake.commits() }));
    return;
  }
  if (url.pathname === '/__file') {
    const content = fake.fileAtHead(url.searchParams.get('path') ?? '');
    res.statusCode = content === null ? 404 : 200;
    res.end(content ?? '');
    return;
  }
  if (url.pathname === '/__reset' && req.method === 'POST') {
    fake.reset();
    res.statusCode = 204;
    res.end();
    return;
  }
  // 同一個假伺服器也扮演 playerdb.co（MOJANG_API_BASE 指向此埠）
  if (isMojangPath(url.pathname)) {
    await send(res, await mojang.fetch(url.href, { headers: { 'User-Agent': String(req.headers['user-agent'] ?? '') } }));
    return;
  }
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  // 轉送全部 header，讓假 GitHub 能檢查 Authorization、Accept 等正式環境細節
  const headers = Object.entries(req.headers).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v.join(', ') : v] as [string, string]]));
  const response = await fake.fetch(url.href, { method, headers, body });
  await send(res, response);
}

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error('fake GitHub request failed:', error);
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
}).listen(PORT, 'localhost', () => console.log(`fake GitHub listening on localhost:${PORT}`));
