import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildProject } from '@mlf/core/merge';
import type { DetectedMod } from '@mlf/core';
import { initialWorkspaceState, useWorkspace } from '../store/workspaceStore';
import { Editor } from './Editor';

const detected: DetectedMod = {
  modId: 'alpha', name: 'Alpha', version: '1', jarName: 'a.jar', format: 'json',
  source: { 'item.a': 'Apple %s', 'item.b': 'Banana', 'item.c': 'Cherry' }, order: ['item.a', 'item.b', 'item.c'],
  zhCn: { 'item.b': '香蕉(简)' },
};

const editEntry = vi.fn();

// jsdom 沒有版面：給所有元素固定尺寸，讓虛擬捲動渲染列
vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
  x: 0, y: 0, top: 0, left: 0, bottom: 800, right: 1024, width: 1024, height: 800, toJSON: () => ({}),
} as DOMRect);
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1024 });

beforeEach(() => {
  editEntry.mockClear();
  useWorkspace.setState({ ...initialWorkspaceState, mods: [buildProject(detected, 1)], activeModId: 'alpha', editEntry });
});

const textareas = () => screen.getAllByRole('textbox', { name: /譯文/ });

describe('Editor / TranslationTable', () => {
  it('renders one row per entry with source text', () => {
    render(<Editor />);
    expect(screen.getByText('Apple %s')).toBeInTheDocument();
    expect(textareas()).toHaveLength(3);
  });

  it('commits on Enter and moves focus to the next row', async () => {
    render(<Editor />);
    await userEvent.type(textareas()[0]!, '蘋果 %s{Enter}');
    expect(editEntry).toHaveBeenCalledWith('alpha', 'item.a', '蘋果 %s');
    await waitFor(() => expect(textareas()[1]).toHaveFocus());
  });

  it('keeps newlines with Shift+Enter and commits on blur', async () => {
    render(<Editor />);
    await userEvent.type(textareas()[1]!, '香{Shift>}{Enter}{/Shift}蕉');
    await userEvent.tab();
    expect(editEntry).toHaveBeenCalledWith('alpha', 'item.b', '香\n蕉');
  });

  it('copies source into target', async () => {
    render(<Editor />);
    await userEvent.click(screen.getAllByRole('button', { name: '複製原文' })[2]!);
    expect(editEntry).toHaveBeenCalledWith('alpha', 'item.c', 'Cherry');
  });

  it('shows format warnings for mismatched placeholders', () => {
    const mod = useWorkspace.getState().mods[0]!;
    const withBad = { ...mod, entries: mod.entries.map((e) => (e.key === 'item.a' ? { ...e, target: '蘋果', status: 'translated' as const } : e)) };
    useWorkspace.setState({ mods: [withBad] });
    render(<Editor />);
    expect(screen.getByText('缺少 %s')).toBeInTheDocument();
  });

  it('filters by status and toggles the zh_cn reference column', async () => {
    render(<Editor />);
    await userEvent.click(screen.getByLabelText('顯示簡體中文參考'));
    expect(screen.getByText('香蕉(简)')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('狀態'), 'translated');
    expect(screen.getByText('沒有符合條件的文字')).toBeInTheDocument();
  });

  it('searches by text', async () => {
    render(<Editor />);
    await userEvent.type(screen.getByPlaceholderText(/搜尋英文或中文/), 'cherry');
    await waitFor(() => expect(textareas()).toHaveLength(1));
  });
});
