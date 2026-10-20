import { describe, expect, it } from 'vitest';
import { buildSourceFor, trackingPlatform } from './platform';

const MR = 'https://modrinth.com/mod/demo';
const CF = 'https://www.curseforge.com/minecraft/mc-mods/demo';

describe('trackingPlatform', () => {
  it('uses Modrinth when only Modrinth is linked', () => {
    expect(trackingPlatform({ modrinth: MR })).toBe('modrinth');
  });

  it('prefers Modrinth when both platforms are linked', () => {
    expect(trackingPlatform({ modrinth: MR, curseforge: CF })).toBe('modrinth');
  });

  it('uses CurseForge for a well-formed CurseForge-only link', () => {
    expect(trackingPlatform({ curseforge: CF })).toBe('curseforge');
  });

  it('ignores CurseForge links that do not match the expected form', () => {
    expect(trackingPlatform({ curseforge: 'https://curseforge.com/minecraft/mc-mods/x' })).toBeNull();
  });

  it('returns null without any link', () => {
    expect(trackingPlatform({})).toBeNull();
  });
});

describe('buildSourceFor', () => {
  it('picks the platform when usable', () => {
    expect(buildSourceFor({ modrinth: MR }, undefined)).toEqual({ platform: 'modrinth' });
    expect(buildSourceFor({ curseforge: CF }, 'key')).toEqual({ platform: 'curseforge' });
  });

  it('skips curseforge mods without a key', () => {
    expect(buildSourceFor({ curseforge: CF }, undefined)).toEqual({ skip: '沒有 CurseForge 金鑰' });
  });

  it('does not need a key for mods also on Modrinth', () => {
    expect(buildSourceFor({ modrinth: MR, curseforge: CF }, undefined)).toEqual({ platform: 'modrinth' });
  });

  it('skips mods without any usable link', () => {
    expect(buildSourceFor({}, 'key')).toEqual({ skip: 'mod.json 沒有 Modrinth 或 CurseForge 連結' });
  });
});
