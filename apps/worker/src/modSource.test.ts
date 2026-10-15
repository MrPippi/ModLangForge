import { describe, expect, it } from 'vitest';
import { loadModFromAssets } from './modSource';
import { testEnv } from './testEnv';

const envWith = (res: Response) => testEnv({ ASSETS: { fetch: async () => res } as unknown as Fetcher });

describe('loadModFromAssets', () => {
  it('returns null on 404', async () => {
    expect(await loadModFromAssets(envWith(new Response('x', { status: 404 })), 'create')).toBeNull();
  });
  it('returns null for non-object JSON', async () => {
    expect(await loadModFromAssets(envWith(Response.json([1, 2])), 'create')).toBeNull();
  });
  it('returns null for invalid JSON', async () => {
    expect(await loadModFromAssets(envWith(new Response('not json')), 'create')).toBeNull();
  });
  it('returns null when en_us is missing', async () => {
    expect(await loadModFromAssets(envWith(Response.json({ zh_tw: {} })), 'create')).toBeNull();
  });
  it('returns { en, zh } for a valid payload', async () => {
    const res = Response.json({ en_us: { a: 'A' }, zh_tw: { a: '甲' } });
    expect(await loadModFromAssets(envWith(res), 'create')).toEqual({ en: { a: 'A' }, zh: { a: '甲' } });
  });
  it('requests a URL-encoded asset path', async () => {
    let url = '';
    const fetchSpy = async (r: Request) => { url = r.url; return new Response('', { status: 404 }); };
    await loadModFromAssets(testEnv({ ASSETS: { fetch: fetchSpy } as unknown as Fetcher }), 'a b');
    expect(url).toBe('https://assets.local/api/v1/mods/a%20b.json');
  });
});
