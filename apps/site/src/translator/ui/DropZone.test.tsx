import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../i18n/zh-TW';
import { initialWorkspaceState, useWorkspace } from '../store/workspaceStore';
import { DropZone } from './DropZone';

const addJars = vi.fn(async () => {});

beforeEach(() => {
  addJars.mockClear();
  useWorkspace.setState({ ...initialWorkspaceState, addJars });
});

describe('DropZone', () => {
  it('passes selected files to addJars', async () => {
    render(<DropZone />);
    const file = new File(['x'], 'a.jar');
    await userEvent.upload(screen.getByLabelText(t.dropzone.hint), file);
    expect(addJars).toHaveBeenCalledWith([file]);
  });

  it('accepts dropped files', () => {
    render(<DropZone />);
    const file = new File(['x'], 'b.jar');
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } });
    expect(addJars).toHaveBeenCalledWith([file]);
  });
});
