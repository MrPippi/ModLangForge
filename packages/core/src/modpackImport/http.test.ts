import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import { chunk, fetchBytes, fetchJson, USER_AGENT } from './index';

describe('chunk', () => {
  it('splits lists into fixed-size batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe('fetchJson / fetchBytes', () => {
  it('adds the User-Agent, keeps extra headers and reports HTTP errors without headers', async () => {
    const f = fakeFetch({ 'https://a.test/x': { ok: 1 } });
    expect(await fetchJson(f, 'https://a.test/x', { headers: { Accept: 'application/json' } })).toEqual({ ok: 1 });
    expect(f.calls[0]?.init?.headers).toEqual({ 'User-Agent': USER_AGENT, Accept: 'application/json' });
    await expect(fetchJson(f, 'https://a.test/missing', { headers: { 'x-api-key': 'secret' } })).rejects.toThrow(/^HTTP 404 https:\/\/a\.test\/missing$/);
  });

  it('downloads bytes with only the User-Agent and enforces the size limit', async () => {
    const f = fakeFetch({ 'https://cdn.test/f.zip': new Uint8Array([1, 2, 3]) });
    expect(await fetchBytes(f, 'https://cdn.test/f.zip')).toEqual(new Uint8Array([1, 2, 3]));
    expect(f.calls[0]?.init?.headers).toEqual({ 'User-Agent': USER_AGENT });
    await expect(fetchBytes(f, 'https://cdn.test/f.zip', 2)).rejects.toThrow('https://cdn.test/f.zip 超過 2 bytes');
    await expect(fetchBytes(f, 'https://cdn.test/none.zip')).rejects.toThrow('HTTP 404 https://cdn.test/none.zip');
  });
});
