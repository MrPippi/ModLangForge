import { describe, expect, it } from 'vitest';
import { isMissing, parseJsonText } from './fsErrors';

describe('isMissing', () => {
  it('recognises ENOENT only', () => {
    expect(isMissing(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(true);
    expect(isMissing(Object.assign(new Error('x'), { code: 'EACCES' }))).toBe(false);
    expect(isMissing(undefined)).toBe(false);
  });
});

describe('parseJsonText', () => {
  it('parses JSON with or without a BOM', () => {
    expect(parseJsonText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonText('﻿{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('returns a displayable reason for invalid JSON', () => {
    const r = parseJsonText('{oops');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).not.toBe('');
  });
});
