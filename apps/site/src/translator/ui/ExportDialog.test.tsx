import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildProject, updateEntry } from '@mlf/core/merge';
import { catalogModSchema } from '@mlf/core/catalog';
import type { DetectedMod, ModProject } from '@mlf/core';
import { initialWorkspaceState, useWorkspace } from '../store/workspaceStore';
import { buildContribution } from './contribution';
import { ExportDialog } from './ExportDialog';

const d = (modId: string, format: 'json' | 'lang' = 'json'): DetectedMod => ({
  modId, name: `${modId} name`, version: '2.0', jarName: `${modId}.jar`, format,
  source: { a: 'Apple %s', b: 'Banana' }, order: ['a', 'b'],
});

let alpha: ModProject;
let beta: ModProject;

beforeEach(() => {
  alpha = updateEntry(buildProject(d('alpha'), 1), 'a', '蘋果', 2);
  beta = buildProject(d('beta', 'lang'), 1);
  useWorkspace.setState({ ...initialWorkspaceState, mods: [alpha, beta], activeModId: 'alpha' });
});

describe('buildContribution', () => {
  it('creates schema-valid mod.json plus en_us / zh_tw per mod', async () => {
    const result = await buildContribution([alpha, beta], '2026-10-15');
    expect(result.fileName).toBe('ModLangForge-contribution.zip');
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const meta = JSON.parse((await zip.file('alpha/mod.json')?.async('string')) ?? '{}');
    expect(catalogModSchema.safeParse(meta).success).toBe(true);
    expect(meta).toMatchObject({
      modId: 'alpha', format: 'json', updatedAt: '2026-10-15',
      sourceVersions: [{ modVersion: '2.0', mcVersion: '1.20.1', loader: 'forge', missingKeys: [] }],
    });
    expect(meta).not.toHaveProperty('modVersion');
    expect(JSON.parse((await zip.file('alpha/zh_tw.json')?.async('string')) ?? '{}')).toEqual({ a: '蘋果' });
    expect(JSON.parse((await zip.file('beta/en_us.json')?.async('string')) ?? '{}')).toEqual({ a: 'Apple %s', b: 'Banana' });
    const betaMeta = JSON.parse((await zip.file('beta/mod.json')?.async('string')) ?? '{}');
    expect(betaMeta.mcVersions).toEqual(['1.12.2']);
    expect(betaMeta.sourceVersions[0]).toMatchObject({ mcVersion: '1.12.2', loader: 'forge' });
    expect(zip.file('README.txt')).not.toBeNull();
  });
});

describe('ExportDialog', () => {
  const setup = () => {
    const exportFn = vi.fn(async () => ({ fileName: 'x.zip', blob: new Blob(['x']) }));
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} exportFn={exportFn} onSave={onSave} />);
    return { exportFn, onSave, onClose };
  };

  it('selects all mods by default and shows warning count', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: /alpha name/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /beta name/ })).toBeChecked();
    expect(screen.getByText('有 1 處特殊符號待確認，仍可下載。')).toBeInTheDocument();
  });

  it('disables export when nothing is selected', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '全不選' }));
    expect(screen.getByRole('button', { name: '下載' })).toBeDisabled();
  });

  it('passes chosen options to the exporter and saves the file', async () => {
    const { exportFn, onSave, onClose } = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: /beta name/ }));
    await userEvent.click(screen.getByRole('radio', { name: /只要翻譯檔/ }));
    await userEvent.click(screen.getByRole('radio', { name: '不放進資源包' }));
    await userEvent.click(screen.getByRole('button', { name: '下載' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(exportFn).toHaveBeenCalledWith([alpha], expect.objectContaining({ kind: 'lang-files', untranslated: 'skip' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('builds a contribution package', async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole('radio', { name: /分享給本站/ }));
    await userEvent.click(screen.getByRole('button', { name: '下載' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].fileName).toBe('ModLangForge-contribution.zip');
  });
});
