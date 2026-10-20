import { describe, expect, it } from 'vitest';
import { fromModrinthVersion, hasWrites, type PlatformBuild, renderTrackSummary, type TrackReport } from './index';

const ver = (num: string): PlatformBuild => fromModrinthVersion({ id: num, version_number: num, game_versions: [], loaders: [], date_published: '', files: [] });

const report: TrackReport = {
  entries: [
    { modId: 'create', target: { kind: 'update', mcVersion: '1.21.1', loader: 'neoforge', version: ver('6.0.7'), previous: '6.0.6' },
      result: { kind: 'written', addedKeys: 12, conflicts: [], replaced: [] } },
    { modId: 'jei', target: { kind: 'add', mcVersion: '1.21.4', loader: 'fabric', version: ver('19.0') },
      result: { kind: 'written', addedKeys: 0, conflicts: [], replaced: [] } },
    { modId: 'balm', target: { kind: 'add', mcVersion: '1.21.4', loader: 'forge', version: ver('21.0') },
      result: { kind: 'conflict', conflicts: [{ key: 'a.b', existing: '%s', incoming: '%d', formatChanged: true }] } },
    { modId: 'moonlight', target: { kind: 'add', mcVersion: '1.20.1', loader: 'forge', version: ver('2.0') },
      result: { kind: 'error', message: 'HTTP 503' } },
  ],
  skipped: [{ modId: 'examplelegacy', reason: '使用 .lang 語言檔，不支援自動追蹤' }],
  deferred: 7,
};

describe('renderTrackSummary', () => {
  const md = renderTrackSummary(report);

  it('summarises counts', () => {
    expect(md).toContain('- 更新已收錄組合：1 組');
    expect(md).toContain('- 新增組合：1 組');
    expect(md).toContain('- 新增英文 key：12 個');
    expect(md).toContain('- 衝突未寫入：1 組');
    expect(md).toContain('- 錯誤：1 組');
    expect(md).toContain('- 超過上限、留到下次：7 組');
  });

  it('lists written, conflicting, failed and skipped items', () => {
    expect(md).toContain('| create | 1.21.1 NeoForge | 6.0.6 → 6.0.7 | 12 |');
    expect(md).toContain('| jei | 1.21.4 Fabric | 19.0（新增） | 0 |');
    expect(md).toContain('- balm 1.21.4 Forge 21.0：`a.b`');
    expect(md).toContain('- moonlight 1.20.1 Forge 2.0：HTTP 503');
    expect(md).toContain('- examplelegacy：使用 .lang 語言檔，不支援自動追蹤');
  });

  it('lists mods whose new keys still need translating, summed per mod', () => {
    const twice = { ...report, entries: [...report.entries, { ...report.entries[0]!, result: { kind: 'written' as const, addedKeys: 3, conflicts: [], replaced: [] } }] };
    const text = renderTrackSummary(twice);
    expect(text).toContain('## 需要補翻譯');
    expect(text).toContain('- create：15 個新 key');
    expect(text).not.toContain('- jei：');
  });

  it('never contains session links', () => {
    expect(md).not.toMatch(/claude\.ai|Claude-Session/);
  });
});

describe('hasWrites', () => {
  it('is true only when something was written', () => {
    expect(hasWrites(report)).toBe(true);
    expect(hasWrites({ ...report, entries: report.entries.filter((e) => e.result.kind !== 'written') })).toBe(false);
  });
});
