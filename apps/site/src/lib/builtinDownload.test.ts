// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { builtinDownloadLink } from './builtinDownload';

describe('builtinDownloadLink', () => {
  it('prefers Modrinth when both platforms exist', () => {
    expect(builtinDownloadLink({ modrinth: 'https://modrinth.com/mod/litematica', curseforge: 'https://www.curseforge.com/minecraft/mc-mods/litematica' })).toEqual({
      href: 'https://modrinth.com/mod/litematica',
      platform: 'modrinth',
    });
  });

  it('falls back to CurseForge when only CurseForge exists', () => {
    expect(builtinDownloadLink({ curseforge: 'https://www.curseforge.com/minecraft/mc-mods/litematica' })).toEqual({
      href: 'https://www.curseforge.com/minecraft/mc-mods/litematica',
      platform: 'curseforge',
    });
  });

  it('returns null without links or with a malformed CurseForge URL', () => {
    expect(builtinDownloadLink({})).toBeNull();
    expect(builtinDownloadLink({ curseforge: 'https://example.com/x' })).toBeNull();
  });
});
