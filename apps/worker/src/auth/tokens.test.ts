import { describe, expect, it } from 'vitest';
import { fromBase64Url, randomToken, safeEqual, toBase64Url } from './crypto';
import { signToken, verifyToken } from './signedToken';

const SECRET = 'x'.repeat(32);

describe('crypto helpers', () => {
  it('round-trips base64url and rejects invalid input', () => {
    const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    expect(fromBase64Url('a+b/')).toBeNull();
  });

  it('creates 43-char url-safe random tokens', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(randomToken());
  });

  it('compares strings safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('signed tokens', () => {
  it('verifies a fresh token and returns its payload', async () => {
    const token = await signToken({ typ: 't', n: 1, exp: 200 }, SECRET);
    expect(await verifyToken(token, SECRET, 100)).toEqual({ typ: 't', n: 1, exp: 200 });
  });

  it.each([
    ['expired', async () => [await signToken({ exp: 100 }, SECRET), 100] as const],
    ['wrong secret', async () => [await signToken({ exp: 200 }, 'y'.repeat(32)), 100] as const],
    ['tampered body', async () => {
      const [, sig] = (await signToken({ exp: 200, uid: 1 }, SECRET)).split('.');
      return [`${toBase64Url(new TextEncoder().encode('{"exp":200,"uid":2}'))}.${sig}`, 100] as const;
    }],
    ['extra segment', async () => [`${await signToken({ exp: 200 }, SECRET)}.x`, 100] as const],
    ['garbage', async () => ['not-a-token', 100] as const],
  ])('rejects %s', async (_name, make) => {
    const [token, now] = await make();
    expect(await verifyToken(token, SECRET, now)).toBeNull();
  });

  it('rejects a missing token', async () => {
    expect(await verifyToken(undefined, SECRET, 0)).toBeNull();
  });
});
