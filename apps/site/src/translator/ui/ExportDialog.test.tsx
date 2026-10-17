import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildProject, updateEntry } from '@mlf/core/merge';
import { questProject } from '@mlf/core/ftbquests';
import { catalogModSchema } from '@mlf/core/catalog';
import type { DetectedMod, ModProject } from '@mlf/core';
import { initialWorkspaceState, useWorkspace } from '../store/workspaceStore';
import { useToasts } from '../store/toastStore';
import { buildContribution } from './contribution';
import { ExportDialog } from './ExportDialog';

const d = (modId: string, format: 'json' | 'lang' = 'json'): DetectedMod => ({
  modId, name: `${modId} name`, version: '2.0', jarName: `${modId}.jar`, format,
  source: { a: 'Apple %s', b: 'Banana' }, order: ['a', 'b'],
});

const GUIDE_PATH = 'guide/en_us/entries/intro.json';
const GUIDE_TEXT = JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Use $(item)it$()' }] });
const guided = (key: string, target: string): ModProject =>
  updateEntry(buildProject({ ...d('gamma'), guide: { files: { [GUIDE_PATH]: GUIDE_TEXT }, skipped: [] } }, 1), key, target, 2, 'guide');

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

  it('adds raw guide files and flattened guide translations for mods with a guide', async () => {
    const result = await buildContribution([guided('guide/entries/intro.json#name', '簡介'), alpha], '2026-10-17');
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(await zip.file(`gamma/patchouli/${GUIDE_PATH}`)?.async('string')).toBe(GUIDE_TEXT);
    expect(JSON.parse((await zip.file('gamma/patchouli_zh_tw.json')?.async('string')) ?? '{}')).toEqual({ 'guide/entries/intro.json#name': '簡介' });
    expect(zip.file('alpha/patchouli_zh_tw.json')).toBeNull();
    expect(await zip.file('README.txt')?.async('string')).toContain('patchouli');
  });

  it('writes no guide files for an emptied guide kept after a guide-less re-upload', async () => {
    const stale = { ...guided('guide/entries/intro.json#name', '簡介') };
    const emptied: ModProject = {
      ...stale,
      guide: { files: {}, entries: (stale.guide?.entries ?? []).map((e) => ({ ...e, status: 'obsolete' as const })) },
    };
    const result = await buildContribution([emptied], '2026-10-17');
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((f) => f.includes('patchouli'))).toEqual([]);
  });

  it('writes no guide files when the guide has no non-obsolete entries', async () => {
    const base = guided('guide/entries/intro.json#name', '簡介');
    const textless = { ...base, guide: { ...base.guide!, entries: [] } };
    const zip = await JSZip.loadAsync(await (await buildContribution([textless], '2026-10-17')).blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((f) => f.includes('patchouli'))).toEqual([]);
  });

  it('skips guide files whose path is not under <book>/en_us/', async () => {
    const base = guided('guide/entries/intro.json#name', '簡介');
    const unsafe: ModProject = {
      ...base,
      guide: { ...base.guide!, files: { ...base.guide!.files, '../evil/en_us/x.json': '{}', 'guide/en_us/templates/t.json': '{}' } },
    };
    const result = await buildContribution([unsafe], '2026-10-17');
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(Object.values(zip.files).filter((f) => !f.dir && f.name.includes('patchouli/')).map((f) => f.name)).toEqual([`gamma/patchouli/${GUIDE_PATH}`]);
  });
});

describe('ExportDialog', () => {
  const setup = () => {
    const exportFn = vi.fn(async () => [{ fileName: 'x.zip', blob: new Blob(['x']) }]);
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

  it('counts guide format warnings together with lang warnings', () => {
    useWorkspace.setState({ mods: [alpha, guided('guide/entries/intro.json#pages/0/text', '使用')] });
    render(<ExportDialog onClose={vi.fn()} exportFn={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('有 2 處特殊符號待確認，仍可下載。')).toBeInTheDocument();
  });

  it('offers 26.x versions and passes the chosen one to the exporter', async () => {
    const { exportFn, onSave } = setup();
    const select = screen.getByLabelText('Minecraft 版本') as HTMLSelectElement;
    expect(Array.from(select.options).slice(0, 2).map((o) => o.value)).toEqual(['26.3', '26.2']);
    await userEvent.selectOptions(select, '26.3');
    await userEvent.click(screen.getByRole('button', { name: '下載' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(exportFn).toHaveBeenCalledWith([alpha, beta], expect.objectContaining({ kind: 'merged-pack', mcVersion: '26.3' }));
  });

  it('saves every exported file separately and explains where the quest file goes when quest projects are selected', async () => {
    const quest = questProject({ id: 'pack', name: 'Pack', version: '1' }, { layout: 'single', en: { 'quest.44A5523F7A909209.title': 'Welcome' }, zh: {} }, 1);
    useWorkspace.setState({ mods: [alpha, quest] });
    const files = [{ fileName: 'ModLangForge-zh_tw.zip', blob: new Blob(['x']) }, { fileName: 'zh_tw.snbt', blob: new Blob(['y']) }];
    const onSave = vi.fn();
    render(<ExportDialog onClose={vi.fn()} exportFn={vi.fn(async () => files)} onSave={onSave} />);
    expect(screen.getByText(/FTB 任務翻譯會另外下載/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '下載' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls.map(([f]) => f.fileName)).toEqual(['ModLangForge-zh_tw.zip', 'zh_tw.snbt']);
  });

  describe('quest projects without translated text', () => {
    const emptyQuest = () => questProject({ id: 'pack', name: 'Pack', version: '1' }, { layout: 'single', en: { 'quest.44A5523F7A909209.title': 'Welcome' }, zh: {} }, 1);
    const toastMessages = () => useToasts.getState().toasts.map((x) => `${x.kind}:${x.message}`);

    beforeEach(() => useToasts.setState({ toasts: [] }));

    it('explains the empty quest selection instead of the generic failure when only quests are chosen', async () => {
      useWorkspace.setState({ mods: [emptyQuest()] });
      const exportFn = vi.fn(async () => []);
      const onClose = vi.fn();
      render(<ExportDialog onClose={onClose} exportFn={exportFn} onSave={vi.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: '下載' }));
      await waitFor(() => expect(toastMessages()).toEqual(['error:所選的 FTB 任務還沒有已翻譯的文字']));
      expect(exportFn).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('still exports the resource pack and tells the user the quest file was skipped when combined with other projects', async () => {
      useWorkspace.setState({ mods: [alpha, emptyQuest()] });
      const files = [{ fileName: 'ModLangForge-zh_tw.zip', blob: new Blob(['x']) }];
      const onSave = vi.fn();
      const onClose = vi.fn();
      render(<ExportDialog onClose={onClose} exportFn={vi.fn(async () => files)} onSave={onSave} />);
      await userEvent.click(screen.getByRole('button', { name: '下載' }));
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(toastMessages()).toEqual(['info:所選的 FTB 任務還沒有已翻譯的文字，這次沒有下載任務檔。']);
      expect(onClose).toHaveBeenCalled();
    });

    it('does not mention skipped quests when the quest has translated text', async () => {
      const filled = questProject({ id: 'pack', name: 'Pack', version: '1' }, { layout: 'single', en: { 'quest.44A5523F7A909209.title': 'Welcome' }, zh: { 'quest.44A5523F7A909209.title': '歡迎' } }, 1);
      useWorkspace.setState({ mods: [alpha, filled] });
      const onSave = vi.fn();
      render(<ExportDialog onClose={vi.fn()} exportFn={vi.fn(async () => [{ fileName: 'x', blob: new Blob(['x']) }])} onSave={onSave} />);
      await userEvent.click(screen.getByRole('button', { name: '下載' }));
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(toastMessages()).toEqual([]);
    });
  });

  it('shows the player-friendly quest note', async () => {
    const quest = questProject({ id: 'pack', name: 'Pack', version: '1' }, { layout: 'single', en: { 'quest.44A5523F7A909209.title': 'Welcome' }, zh: {} }, 1);
    useWorkspace.setState({ mods: [quest] });
    render(<ExportDialog onClose={vi.fn()} exportFn={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText(/若裡面已有 zh_tw 資料夾，就放進那個資料夾/)).toBeInTheDocument();
    expect(screen.queryByText(/split/)).toBeNull();
  });

  it('shows no quest note without quest projects', () => {
    setup();
    expect(screen.queryByText(/FTB 任務翻譯會另外下載/)).toBeNull();
  });
});
