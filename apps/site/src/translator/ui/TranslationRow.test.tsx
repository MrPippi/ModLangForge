import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TranslationEntry } from '@mlf/core';
import { TranslationRow } from './TranslationRow';

const entry: TranslationEntry = { key: 'item.a', source: 'Apple', target: '', status: 'untranslated' };

function renderRow() {
  const onCommit = vi.fn();
  const utils = render(
    <TranslationRow index={0} modId="alpha" entry={entry} showModId={false} showReference={false} onCommit={onCommit} onNavigate={vi.fn()} />,
  );
  return { onCommit, ...utils };
}

describe('TranslationRow draft safety', () => {
  it('commits an unsaved draft when the row unmounts (scrolled out of the virtual list)', async () => {
    const { onCommit, unmount } = renderRow();
    await userEvent.type(screen.getByRole('textbox'), '草稿');
    unmount();
    expect(onCommit).toHaveBeenCalledWith('alpha', 'item.a', '草稿');
  });

  it('commits an unsaved draft when the page is hidden', async () => {
    const { onCommit } = renderRow();
    await userEvent.type(screen.getByRole('textbox'), '草稿');
    fireEvent(window, new Event('pagehide'));
    expect(onCommit).toHaveBeenCalledWith('alpha', 'item.a', '草稿');
  });

  it('does not commit when there is no draft', () => {
    const { onCommit, unmount } = renderRow();
    unmount();
    fireEvent(window, new Event('pagehide'));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
