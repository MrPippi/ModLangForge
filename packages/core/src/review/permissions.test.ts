import { describe, expect, it } from 'vitest';
import { can, ipSubject, isBootstrapAdmin, isSubject, parseAdminBootstrap, SUGGESTION_STATUSES, userSubject } from './index';

describe('can', () => {
  it.each([
    [null, 'suggest', true],
    [null, 'review', false],
    [null, 'publish', false],
    [null, 'manage', false],
    ['contributor', 'suggest', true],
    ['contributor', 'review', false],
    ['reviewer', 'review', true],
    ['reviewer', 'publish', false],
    ['reviewer', 'manage', false],
    ['admin', 'review', true],
    ['admin', 'publish', true],
    ['admin', 'manage', true],
  ] as const)('%s may %s: %s', (role, action, expected) => {
    expect(can(role, action)).toBe(expected);
  });
});

describe('admin bootstrap', () => {
  const list = parseAdminBootstrap(' github:MrPippi , discord:Admin2,bogus, ');

  it('matches provider:username case-insensitively', () => {
    expect(isBootstrapAdmin(list, 'github', 'mrpippi')).toBe(true);
    expect(isBootstrapAdmin(list, 'discord', 'ADMIN2')).toBe(true);
  });

  it('does not cross providers or accept missing usernames', () => {
    expect(isBootstrapAdmin(list, 'discord', 'MrPippi')).toBe(false);
    expect(isBootstrapAdmin(list, 'github', null)).toBe(false);
    expect(isBootstrapAdmin(parseAdminBootstrap(undefined), 'github', 'MrPippi')).toBe(false);
    expect(list.has('bogus')).toBe(false);
  });
});

describe('subjects', () => {
  const hash = 'a'.repeat(64);

  it('formats and validates subjects', () => {
    expect(ipSubject(hash)).toBe(`ip:${hash}`);
    expect(userSubject(12)).toBe('user:12');
    expect(isSubject(`ip:${hash}`)).toBe(true);
    expect(isSubject('user:12')).toBe(true);
  });

  it.each(['user:0', 'user:-1', 'user:abc', 'ip:xyz', `ip:${'A'.repeat(64)}`, 'email:a@b', ''])('rejects %s', (value) => {
    expect(isSubject(value)).toBe(false);
  });

  it('lists suggestion statuses in schema order', () => {
    expect(SUGGESTION_STATUSES).toEqual(['pending', 'approved', 'rejected', 'superseded', 'conflict', 'published']);
  });
});
