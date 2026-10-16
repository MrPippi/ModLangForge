import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionDownload } from './VersionDownload';

function setup(disabled = false) {
  const onVersionChange = vi.fn();
  const onDownload = vi.fn();
  render(
    <VersionDownload versions={['1.21.1', '1.20.1']} version="1.21.1" disabled={disabled} onVersionChange={onVersionChange} onDownload={onDownload}>
      下載資源包
    </VersionDownload>,
  );
  return { onVersionChange, onDownload };
}

describe('VersionDownload', () => {
  it('renders the version select and download button as one labelled group', () => {
    setup();
    const select = screen.getByLabelText('Minecraft 版本');
    const button = screen.getByRole('button', { name: '下載資源包' });
    expect(select).toHaveValue('1.21.1');
    expect(select.parentElement).toBe(button.parentElement);
    expect(select.parentElement).toHaveClass('dl-group');
  });

  it('reports version changes and download clicks', async () => {
    const { onVersionChange, onDownload } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Minecraft 版本'), '1.20.1');
    expect(onVersionChange).toHaveBeenCalledWith('1.20.1');
    await userEvent.click(screen.getByRole('button', { name: '下載資源包' }));
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('disables only the download button', () => {
    setup(true);
    expect(screen.getByRole('button', { name: '下載資源包' })).toBeDisabled();
    expect(screen.getByLabelText('Minecraft 版本')).toBeEnabled();
  });
});
