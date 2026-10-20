import { describe, expect, it } from 'vitest';
import { pickDraftAuthors } from './index';

describe('pickDraftAuthors', () => {
  it('uses the Modrinth usernames when there are any', () => {
    expect(pickDraftAuthors(['alice', 'bob'], ['cf-alice'])).toEqual(['alice', 'bob']);
  });

  it('falls back to every CurseForge author for an org-owned Modrinth project', () => {
    expect(pickDraftAuthors([], ['FTB', 'LatvianModder', 'FTB'])).toEqual(['FTB', 'LatvianModder']);
  });

  it('drops blank names and returns an empty list when nobody is known', () => {
    expect(pickDraftAuthors([' '], [''])).toEqual([]);
    expect(pickDraftAuthors([], [])).toEqual([]);
  });
});
