import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TranslationEntry } from '@mlf/core';
import { checkGuideFormat } from '@mlf/core/patchouli';
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

describe('TranslationRow glossary hints', () => {
  const terms = [
    { en: 'Redstone', zh: '紅石', level: 'warning' as const },
    { en: 'Torch', zh: '火把', level: 'warning' as const },
  ];
  const row = (source: string, target: string, rowTerms = terms) =>
    render(
      <TranslationRow
        index={0}
        modId="alpha"
        entry={{ key: 'k', source, target, status: target ? 'translated' : 'untranslated' }}
        showModId={false}
        showReference={false}
        terms={rowTerms}
        onCommit={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

  it('lists matched terms without warnings while untranslated', () => {
    const { container } = row('Redstone Torch', '');
    expect(screen.getByText('術語：')).toBeInTheDocument();
    expect(screen.getByText('Redstone→紅石')).toBeInTheDocument();
    expect(screen.getByText('Torch→火把')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-missing]')).toHaveLength(0);
  });

  it('marks terms the translation does not use, updating as the draft changes', async () => {
    const { container } = row('Redstone Torch', '紅色火把');
    expect([...container.querySelectorAll('[data-missing]')].map((n) => n.textContent)).toEqual(['⚠Redstone→紅石']);
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), '紅石火把');
    expect(container.querySelectorAll('[data-missing]')).toHaveLength(0);
  });

  it('renders nothing when no term matches', () => {
    row('Apple', '');
    expect(screen.queryByText('術語：')).not.toBeInTheDocument();
  });

  it('marks unused terms with a visible symbol and an accessible label, not colour alone', () => {
    const { container } = row('Redstone Torch', '紅色火把');
    const missing = container.querySelector('[data-missing]')!;
    expect(missing.textContent).toBe('⚠Redstone→紅石');
    expect(missing).toHaveAttribute('title', '譯文未使用規定譯名');
    expect(screen.getByLabelText('Redstone→紅石（譯文未使用規定譯名）')).toBe(missing);
  });
});

describe('TranslationRow format check', () => {
  const guideEntry: TranslationEntry = { key: 'g', source: 'Use $(item)it$()', target: '使用', status: 'translated' };

  it('uses the provided checker for warnings', () => {
    render(<TranslationRow index={0} modId="alpha" entry={guideEntry} showModId={false} showReference={false} check={checkGuideFormat} onCommit={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('缺少 $(item) $()')).toBeInTheDocument();
  });

  it('defaults to the lang checker, which ignores Patchouli codes', () => {
    render(<TranslationRow index={0} modId="alpha" entry={guideEntry} showModId={false} showReference={false} onCommit={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.queryByText(/缺少/)).not.toBeInTheDocument();
  });
});

describe('TranslationRow multi-line text', () => {
  it('opens multi-line sources as multi-line editors and keeps Shift+Enter newlines', async () => {
    const onCommit = vi.fn();
    const multi: TranslationEntry = { key: 'quest.44A5523F7A909209.quest_desc', source: 'Line one\nLine two\nLine three', target: '', status: 'untranslated' };
    render(<TranslationRow index={0} modId="modpack-quests:p" entry={multi} showModId={false} showReference={false} onCommit={onCommit} onNavigate={vi.fn()} />);
    const box = screen.getByRole('textbox');
    expect(box).toHaveAttribute('rows', '3');
    await userEvent.type(box, '第一行{Shift>}{Enter}{/Shift}第二行{Enter}');
    expect(onCommit).toHaveBeenCalledWith('modpack-quests:p', multi.key, '第一行\n第二行');
  });

  it('keeps single-line sources on one row', () => {
    renderRow();
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '1');
  });
});
