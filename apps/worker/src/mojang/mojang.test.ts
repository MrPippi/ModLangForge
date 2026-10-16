import { describe, expect, it } from 'vitest';
import { missingEnv } from '../env';
import { testEnv } from '../testEnv';
import { lookupMinecraftName, MOJANG_TIMEOUT_MS, MOJANG_USER_AGENT } from './client';
import { createFakeMojang } from './fakeMojang';

const BASE = 'https://mojang.test';
const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';

describe('lookupMinecraftName', () => {
  it('returns the canonical name and a lowercase uuid, sending only the name and our User-Agent', async () => {
    const fake = createFakeMojang();
    expect(await lookupMinecraftName(fake.fetch, BASE, 'steve')).toEqual({ kind: 'found', name: 'Steve', uuid: STEVE_UUID });
    expect(fake.requests()).toEqual([
      { url: `${BASE}/users/profiles/minecraft/steve`, userAgent: MOJANG_USER_AGENT, headerNames: ['accept', 'user-agent'] },
    ]);
  });

  it('sends no cookie, authorization or user data: exact header set and a name-only URL', async () => {
    const fake = createFakeMojang();
    await lookupMinecraftName(fake.fetch, BASE, 'Steve');
    const req = fake.requests()[0]!;
    expect([...req.headerNames].sort()).toEqual(['accept', 'user-agent']);
    const url = new URL(req.url);
    expect(url.origin).toBe(BASE);
    expect(url.pathname).toBe('/users/profiles/minecraft/Steve');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  it('passes an AbortSignal timeout in the fetch init', async () => {
    expect(MOJANG_TIMEOUT_MS).toBe(5000);
    let seen: RequestInit | undefined;
    await lookupMinecraftName(async (_input, init) => {
      seen = init;
      return new Response(null, { status: 404 });
    }, BASE, 'x');
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    expect(seen?.signal?.aborted).toBe(false);
  });

  it('maps an abort or timeout to failed status 0', async () => {
    const aborted = async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    };
    expect(await lookupMinecraftName(aborted, BASE, 'x')).toEqual({ kind: 'failed', status: 0 });
  });

  it('accepts a base with a trailing slash and uppercase uuids', async () => {
    const upper = async () => Response.json({ id: STEVE_UUID.toUpperCase(), name: 'Steve' });
    expect(await lookupMinecraftName(upper, `${BASE}/`, 'Steve')).toEqual({ kind: 'found', name: 'Steve', uuid: STEVE_UUID });
  });

  it('maps 404 and 204 to not_found', async () => {
    expect(await lookupMinecraftName(createFakeMojang().fetch, BASE, 'nobody')).toEqual({ kind: 'not_found' });
    expect(await lookupMinecraftName(async () => new Response(null, { status: 204 }), BASE, 'x')).toEqual({ kind: 'not_found' });
  });

  it('maps 429 to rate_limited and everything else to failed', async () => {
    const fake = createFakeMojang();
    expect(await lookupMinecraftName(fake.fetch, BASE, 'ratelimited')).toEqual({ kind: 'rate_limited' });
    expect(await lookupMinecraftName(fake.fetch, BASE, 'broken')).toEqual({ kind: 'failed', status: 500 });
    expect(await lookupMinecraftName(async () => { throw new TypeError('network down'); }, BASE, 'x')).toEqual({ kind: 'failed', status: 0 });
    expect(await lookupMinecraftName(async () => Response.json({ id: 'nope', name: 'Steve' }), BASE, 'x')).toEqual({ kind: 'failed', status: 200 });
    expect(await lookupMinecraftName(async () => new Response('<html>', { status: 200 }), BASE, 'x')).toEqual({ kind: 'failed', status: 200 });
  });
});

describe('mojang env group', () => {
  it('requires MOJANG_API_BASE', () => {
    expect(missingEnv(testEnv({ MOJANG_API_BASE: '' }), 'mojang')).toEqual(['MOJANG_API_BASE']);
    expect(missingEnv(testEnv(), 'mojang')).toEqual([]);
  });
});
