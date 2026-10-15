import { describe, expect, it, vi } from 'vitest';
import { clientIp, hashIp } from './ipHash';
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from './turnstile';

describe('hashIp', () => {
  it('is deterministic, salted and hex', async () => {
    const a = await hashIp('s1', '1.2.3.4');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp('s1', '1.2.3.4')).toBe(a);
    expect(await hashIp('s2', '1.2.3.4')).not.toBe(a);
  });

  it('reads CF-Connecting-IP or falls back to unknown', () => {
    expect(clientIp(new Request('https://x', { headers: { 'CF-Connecting-IP': '9.9.9.9' } }))).toBe('9.9.9.9');
    expect(clientIp(new Request('https://x'))).toBe('unknown');
    expect(clientIp(new Request('https://x', { headers: { 'CF-Connecting-IP': '' } }))).toBe('unknown');
  });
});

describe('verifyTurnstile', () => {
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('checks the hostname when one is expected', async () => {
    const fetchImpl = reply({ success: true, hostname: 'mlf.test' });
    expect(await verifyTurnstile('sec', 'tok', 'ip', fetchImpl, 'mlf.test')).toBe(true);
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: true, hostname: 'evil.test' }), 'mlf.test')).toBe(false);
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: true }), 'mlf.test')).toBe(false);
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: true, hostname: 'example.com' }), null)).toBe(true);
  });

  it('posts secret, token and ip and returns success', async () => {
    const fetchImpl = reply({ success: true });
    expect(await verifyTurnstile('sec', 'tok', '1.1.1.1', fetchImpl)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    const form = init.body as FormData;
    expect([form.get('secret'), form.get('response'), form.get('remoteip')]).toEqual(['sec', 'tok', '1.1.1.1']);
  });

  it('returns false on failure, HTTP error, bad JSON, network error or empty token', async () => {
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: false }))).toBe(false);
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: true }, 500))).toBe(false);
    expect(await verifyTurnstile('sec', 'tok', 'ip', vi.fn(async () => new Response('not json')))).toBe(false);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await verifyTurnstile('sec', 'tok', 'ip', vi.fn(async () => { throw new Error('down'); }))).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }

    expect(await verifyTurnstile('sec', '', 'ip', reply({ success: true }))).toBe(false);
  });

  it('passes an abort signal and treats a timeout as failure', async () => {
    const fetchImpl = reply({ success: true });
    await verifyTurnstile('sec', 'tok', 'ip', fetchImpl);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const timeout = vi.fn(async () => { throw new DOMException('timed out', 'AbortError'); });
      expect(await verifyTurnstile('sec', 'tok', 'ip', timeout)).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
