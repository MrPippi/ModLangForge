import { describe, expect, it } from 'vitest';
import { parseTrackModpacksArgs, TRACK_MODPACKS_USAGE } from './index';

describe('parseTrackModpacksArgs', () => {
  it('accepts no arguments or a single --summary path', () => {
    expect(parseTrackModpacksArgs([])).toEqual({});
    expect(parseTrackModpacksArgs(['--summary', '/tmp/summary.md'])).toEqual({ summary: '/tmp/summary.md' });
    expect(parseTrackModpacksArgs(['--summary=/tmp/summary.md'])).toEqual({ summary: '/tmp/summary.md' });
  });

  it.each([
    [['--summary']], [['--summary', '']], [['--summary', '--other']], [['--summary=']],
    [['--max-builds', '3']], [['--summary', 'a.md', 'b.md']], [['summary.md']],
  ])('rejects %j with the usage line', (argv) => {
    expect(() => parseTrackModpacksArgs(argv)).toThrow(TRACK_MODPACKS_USAGE);
  });
});
