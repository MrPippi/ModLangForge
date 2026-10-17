import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildProject } from '@mlf/core/merge';
import type { DetectedMod } from '@mlf/core';
import { initialWorkspaceState, useWorkspace } from '../store/workspaceStore';
import { questProject } from '@mlf/core/ftbquests';
import { Editor } from './Editor';

vi.mock('../glossary/useGlossary', () => ({ useGlossary: () => null }));

// jsdom 沒有版面：給所有元素固定尺寸，讓虛擬捲動渲染列
vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
  x: 0, y: 0, top: 0, left: 0, bottom: 800, right: 1024, width: 1024, height: 800, toJSON: () => ({}),
} as DOMRect);
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1024 });

const detected = (modId: string, guide?: DetectedMod['guide']): DetectedMod => ({
  modId, name: modId, version: '1', jarName: `${modId}.jar`, format: 'json',
  source: { k: `${modId} text` }, order: ['k'],
  ...(guide ? { guide } : {}),
});

const GUIDE = { files: { 'book/en_us/entries/a.json': JSON.stringify({ name: 'Guide name' }) }, skipped: [] };

beforeEach(() => {
  useWorkspace.setState({
    ...initialWorkspaceState,
    mods: [buildProject(detected('alpha'), 1), buildProject(detected('beta', GUIDE), 1)],
    activeModId: 'alpha',
  });
});

const sectionSelect = () => screen.queryByRole('combobox', { name: '內容' });

describe('Editor section toggle', () => {
  it('follows the mods in scope: hidden for a guide-less active mod, shown for all mods', async () => {
    render(<Editor />);
    expect(sectionSelect()).toBeNull();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '搜尋範圍' }), 'all');
    expect(sectionSelect()).not.toBeNull();
    useWorkspace.setState({ activeModId: 'beta' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '搜尋範圍' }), 'current');
    expect(sectionSelect()).not.toBeNull();
  });

  it('falls back to language entries when the toggle disappears while 手冊 is selected', async () => {
    render(<Editor />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '搜尋範圍' }), 'all');
    await userEvent.selectOptions(sectionSelect()!, 'guide');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '搜尋範圍' }), 'current');
    expect(sectionSelect()).toBeNull();
    expect(screen.getByText('alpha text')).toBeInTheDocument();
  });
});

describe('Editor format checks', () => {
  it('checks FTB quest projects with the quest format codes', () => {
    const quest = questProject(
      { id: 'example-quests', name: 'Example Quests', version: '1' },
      { layout: 'single', en: { 'quest.44A5523F7A909209.title': '&aWelcome' }, zh: { 'quest.44A5523F7A909209.title': '歡迎' } },
      1,
    );
    useWorkspace.setState({ ...initialWorkspaceState, mods: [quest], activeModId: quest.id });
    render(<Editor />);
    expect(screen.getByText('缺少 &a')).toBeInTheDocument();
  });
});
