import { describe, expect, it } from 'vitest';
import { type ModpackTrackReport, NO_UPDATES_LINE, renderModpackTrackSummary, SKIP_EXAMPLE, SKIP_NO_KEY } from './index';

const source = (version: string) => ({ platform: 'modrinth', projectId: 'AbCd1234', version, mcVersion: '1.20.1', loader: 'forge' }) as const;

const report: ModpackTrackReport = {
  entries: [
    {
      kind: 'updated', id: 'tracked-pack', name: 'Tracked | Pack', from: source('1.3.0'), to: { version: '1.4.0', mcVersion: '1.21.1', loader: 'neoforge' },
      modsBefore: 5, modsAfter: 7, kubejsAddedKeys: 2, questAddedKeys: 3, differing: ['kubejs:item.kubejs.gear'], notes: ['略過非 Modrinth 來源的檔案：mods/private.jar'],
    },
    {
      kind: 'updated', id: 'steady-pack', name: 'Steady', from: source('2.0'), to: { version: '2.1', mcVersion: '1.20.1', loader: 'forge' },
      modsBefore: 4, modsAfter: 4, kubejsAddedKeys: 0, questAddedKeys: 0, differing: [], notes: [],
    },
    { kind: 'manual', id: 'broken-pack', reason: '格式碼改變，未寫入：kubejs:item.kubejs.casing' },
    { kind: 'manual', id: 'multi-line', reason: '第一行\n  第二行' },
    { kind: 'skipped', id: 'example-pack', reason: SKIP_EXAMPLE },
    { kind: 'skipped', id: 'cf-pack', reason: SKIP_NO_KEY },
  ],
};

describe('renderModpackTrackSummary', () => {
  const md = renderModpackTrackSummary(report);

  it('summarises counts', () => {
    expect(md).toContain('- 已更新：2 個整合包');
    expect(md).toContain('- 需要人工處理：2 個');
    expect(md).toContain('- 略過：2 個');
    expect(md).not.toContain(NO_UPDATES_LINE);
  });

  it('lists name, versions, Minecraft version, mod count change and new keys', () => {
    expect(md).toContain('| 整合包 | 版本 | Minecraft | 模組數 | KubeJS 新增 key | FTB 任務新增 key |');
    expect(md).toContain('| Tracked \\| Pack（tracked-pack） | 1.3.0 → 1.4.0 | 1.20.1 → 1.21.1 | 5 → 7 | 2 | 3 |');
    expect(md).toContain('| Steady（steady-pack） | 2.0 → 2.1 | 1.20.1 | 4 | 0 | 0 |');
  });

  it('lists differing English, notes, manual work and skipped packs', () => {
    expect(md).toContain('## 原文不同（保留既有原文，請確認）');
    expect(md).toContain('- tracked-pack：`kubejs:item.kubejs.gear`');
    expect(md).toContain('- tracked-pack：略過非 Modrinth 來源的檔案：mods/private.jar');
    expect(md).toContain('- broken-pack：格式碼改變，未寫入：kubejs:item.kubejs.casing');
    expect(md).toContain('- multi-line：第一行 第二行');
    expect(md).toContain('- example-pack：範例資料');
    expect(md).toContain(`- cf-pack：${SKIP_NO_KEY}`);
  });

  it('says so when nothing was updated and omits empty sections', () => {
    const text = renderModpackTrackSummary({ entries: [{ kind: 'skipped', id: 'a', reason: '已是最新' }] });
    expect(text).toContain(NO_UPDATES_LINE);
    expect(text).toContain('- 已更新：0 個整合包');
    expect(text).not.toContain('## 已更新');
    expect(text).not.toContain('## 需要人工處理');
    expect(renderModpackTrackSummary({ entries: [] })).toContain(NO_UPDATES_LINE);
  });

  it('escapes html and ampersands in table names and list text', () => {
    const text = renderModpackTrackSummary({
      entries: [
        { kind: 'updated', id: 'p', name: '<details>A & B</details>', from: source('1.0'), to: { version: '1.1', mcVersion: '1.20.1', loader: 'forge' }, modsBefore: 1, modsAfter: 1, kubejsAddedKeys: 0, questAddedKeys: 0, differing: [], notes: [] },
        { kind: 'manual', id: 'm', reason: '<details>x</details>' },
      ],
    });
    expect(text).toContain('&lt;details&gt;A &amp; B&lt;/details&gt;（p）');
    expect(text).toContain('- m：&lt;details&gt;x&lt;/details&gt;');
    expect(text).not.toContain('<details>');
  });

  it('escapes backslash before pipe in table cells', () => {
    const text = renderModpackTrackSummary({
      entries: [{ kind: 'updated', id: 'p', name: 'Pack\\|', from: source('1.0'), to: { version: '1.1', mcVersion: '1.20.1', loader: 'forge' }, modsBefore: 1, modsAfter: 1, kubejsAddedKeys: 0, questAddedKeys: 0, differing: [], notes: [] }],
    });
    expect(text).toContain('| Pack\\\\\\|（p） |');
  });

  it('flattens newlines in table cells', () => {
    const text = renderModpackTrackSummary({
      entries: [{ kind: 'updated', id: 'p', name: 'Line1\r\nLine2', from: source('1.0'), to: { version: '1.1', mcVersion: '1.20.1', loader: 'forge' }, modsBefore: 1, modsAfter: 1, kubejsAddedKeys: 0, questAddedKeys: 0, differing: [], notes: [] }],
    });
    expect(text.split('\n').some((line) => line.startsWith('| Line1 Line2（p） |'))).toBe(true);
  });

  it('keeps pipes in manual reasons literal', () => {
    expect(renderModpackTrackSummary({ entries: [{ kind: 'manual', id: 'm', reason: 'a | b' }] })).toContain('- m：a | b');
  });

  it('falls back to escaped plain text for differing keys containing a backtick', () => {
    const text = renderModpackTrackSummary({
      entries: [{ kind: 'updated', id: 'p', name: 'P', from: source('1.0'), to: { version: '1.1', mcVersion: '1.20.1', loader: 'forge' }, modsBefore: 1, modsAfter: 1, kubejsAddedKeys: 0, questAddedKeys: 0, differing: ['kubejs:a`b<x>'], notes: [] }],
    });
    expect(text).toContain('- p：kubejs:a`b&lt;x&gt;');
    expect(text).not.toContain('`kubejs');
  });

  it('never contains session links', () => {
    expect(md).not.toMatch(/claude\.ai|Claude-Session/);
  });
});
