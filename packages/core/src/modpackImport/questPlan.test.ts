import { describe, expect, it } from 'vitest';
import { planQuestWrite } from './index';

const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const EN = { [TITLE]: '&aWelcome', [DESC]: 'Line one\nLine two' };
const SUPPORTED = { status: 'supported', layout: 'single' } as const;
const incoming = (layout: 'single' | 'split' = 'single') => ({ status: 'supported', layout, en: EN }) as const;

describe('planQuestWrite', () => {
  it('creates en_us.json and the supported field for a new pack', () => {
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: undefined, existingEn: undefined, incoming: incoming('split') })).toEqual({
      kind: 'write', meta: { status: 'supported', layout: 'split' }, en: EN,
      change: { created: true, addedKeys: [TITLE, DESC], conflicts: [] },
    });
  });

  it('adds new keys, keeps the existing English for changed lines and lists them', () => {
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: SUPPORTED, existingEn: { [TITLE]: '&aWelcome!' }, incoming: incoming() })).toEqual({
      kind: 'write', meta: SUPPORTED, en: { [TITLE]: '&aWelcome!', [DESC]: 'Line one\nLine two' },
      change: { created: false, addedKeys: [DESC], conflicts: [{ key: TITLE, existing: '&aWelcome!', incoming: '&aWelcome', formatChanged: false }] },
    });
  });

  it('does not rewrite en_us.json when nothing was added, and a different line count is not a format change', () => {
    const plan = planQuestWrite({ mcVersion: '1.21.1', existingMeta: SUPPORTED, existingEn: { [TITLE]: '&aWelcome', [DESC]: 'Line one' }, incoming: incoming() });
    expect(plan).toEqual({
      kind: 'write', meta: SUPPORTED,
      change: { created: false, addedKeys: [], conflicts: [{ key: DESC, existing: 'Line one', incoming: 'Line one\nLine two', formatChanged: false }] },
    });
  });

  it('refuses when a quest format code changed', () => {
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: SUPPORTED, existingEn: { [TITLE]: 'Welcome' }, incoming: incoming() })).toEqual({
      kind: 'refused', conflicts: [{ key: TITLE, existing: 'Welcome', incoming: '&aWelcome', formatChanged: true }],
    });
  });

  it('marks packs below 1.21 as unsupported', () => {
    expect(planQuestWrite({ mcVersion: '1.20.1', existingMeta: undefined, existingEn: undefined, incoming: { status: 'unsupported-version' } })).toEqual({
      kind: 'write', meta: { status: 'unsupported-version' },
    });
  });

  it('keeps the existing field and says so when the new version has no quest files, dropping a stale unsupported-version on 1.21+', () => {
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: SUPPORTED, existingEn: EN, incoming: undefined })).toEqual({
      kind: 'write', meta: SUPPORTED, change: { created: false, addedKeys: [], conflicts: [], note: '新版沒有 FTB 任務檔，沿用既有資料' },
    });
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: { status: 'unsupported-version' }, existingEn: undefined, incoming: undefined })).toEqual({ kind: 'write', meta: undefined });
    expect(planQuestWrite({ mcVersion: '1.20.1', existingMeta: { status: 'unsupported-version' }, existingEn: undefined, incoming: undefined })).toEqual({
      kind: 'write', meta: { status: 'unsupported-version' },
    });
  });

  it('stops instead of dropping existing quest data when the new version is below 1.21', () => {
    expect(() => planQuestWrite({ mcVersion: '1.20.1', existingMeta: SUPPORTED, existingEn: EN, incoming: { status: 'unsupported-version' } })).toThrow(
      '這次匯入的是 Minecraft 1.20.1（低於 1.21），但已有 FTB 任務資料（ftbquests/en_us.json）；未寫入任何檔案，請人工確認',
    );
  });
});
