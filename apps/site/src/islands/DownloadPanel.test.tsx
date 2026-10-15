import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCart } from './cartStore';
import DownloadPanel from './DownloadPanel';

beforeEach(() => {
  useCart.setState({ items: [], hydrated: false });
  vi.unstubAllGlobals();
});

describe('DownloadPanel', () => {
  it('defaults to the newest version and toggles the cart', async () => {
    render(<DownloadPanel modId="create" mcVersions={['1.20.1', '1.21.1']} />);
    expect(screen.getByLabelText('Minecraft 版本')).toHaveValue('1.21.1');
    await userEvent.click(screen.getByRole('button', { name: /加入合併包/ }));
    expect(useCart.getState().items).toEqual(['create']);
    await userEvent.click(screen.getByRole('button', { name: /已在合併包/ }));
    expect(useCart.getState().items).toEqual([]);
  });

  it('shows an error with retry when download fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    render(<DownloadPanel modId="create" mcVersions={['1.20.1']} />);
    await userEvent.click(screen.getByRole('button', { name: /下載資源包/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('下載失敗');
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });
});
