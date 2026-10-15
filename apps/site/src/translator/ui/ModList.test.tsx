import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildProject, updateEntry } from '@mlf/core/merge';
import { initialWorkspaceState, useWorkspace } from '../store/workspaceStore';
import type { DetectedMod } from '@mlf/core';
import { ModList } from './ModList';
import { ConflictDialog } from './ConflictDialog';

function detected(modId: string, name: string): DetectedMod {
  return { modId, name, version: '1.0', jarName: `${modId}.jar`, format: 'json', source: { a: 'A', b: 'B' }, order: ['a', 'b'] };
}

beforeEach(() => {
  const alpha = updateEntry(buildProject(detected('alpha', 'Alpha Mod'), 1), 'a', '甲', 2);
  const beta = buildProject(detected('beta', 'Beta Mod'), 1);
  useWorkspace.setState({ ...initialWorkspaceState, mods: [alpha, beta], activeModId: 'alpha' });
});

describe('ModList', () => {
  it('shows name, version and progress', () => {
    render(<ModList />);
    expect(screen.getByText('Alpha Mod')).toBeInTheDocument();
    expect(screen.getByText('1/2 · 50%')).toBeInTheDocument();
    expect(screen.getByText('0/2 · 0%')).toBeInTheDocument();
  });

  it('activates a mod on click', async () => {
    render(<ModList />);
    await userEvent.click(screen.getByText('Beta Mod'));
    expect(useWorkspace.getState().activeModId).toBe('beta');
  });
});

describe('ConflictDialog', () => {
  it('shows the first pending conflict and resolves it', async () => {
    useWorkspace.setState({ pendingConflicts: [detected('alpha', 'Alpha Mod')] });
    render(<ConflictDialog />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Alpha Mod');
    await userEvent.click(screen.getByRole('button', { name: /略過/ }));
    expect(useWorkspace.getState().pendingConflicts).toHaveLength(0);
  });

  it('renders nothing without conflicts', () => {
    const { container } = render(<ConflictDialog />);
    expect(container).toBeEmptyDOMElement();
  });
});
