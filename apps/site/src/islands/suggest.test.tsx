import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuggestDialog from './SuggestDialog';
import { submitSuggestion } from './suggestApi';

vi.mock('./TurnstileWidget', () => ({
  default: ({ onToken }: { onToken: (t: string) => void }) => <button type="button" onClick={() => onToken('tok')}>通過驗證</button>,
}));

const modJson = { version: 1, meta: {}, en_us: { a: 'Apple %s', b: 'Banana' }, zh_tw: { a: '蘋果 %s' } };
const jsonRes = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('submitSuggestion', () => {
  it('maps success and error envelopes', async () => {
    const okFetch = vi.fn(async () => jsonRes({ ok: true, data: { id: 3, formatWarning: true } }, 201));
    expect(await submitSuggestion({ modId: 'm', key: 'a', proposed: 'x', turnstileToken: 't' }, okFetch as never))
      .toEqual({ ok: true, id: 3, formatWarning: true });
    const errFetch = vi.fn(async () => jsonRes({ ok: false, error: { code: 'rate_limited', message: '太頻繁' } }, 429));
    expect(await submitSuggestion({ modId: 'm', key: 'a', proposed: 'x', turnstileToken: 't' }, errFetch as never))
      .toEqual({ ok: false, code: 'rate_limited', message: '太頻繁' });
    const netFetch = vi.fn(async () => { throw new Error('offline'); });
    expect(await submitSuggestion({ modId: 'm', key: 'a', proposed: 'x', turnstileToken: 't' }, netFetch as never))
      .toMatchObject({ ok: false, code: 'network' });
  });
});

describe('SuggestDialog', () => {
  function mount(fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => (url.endsWith('.json') ? jsonRes(modJson) : jsonRes({ ok: true, data: { id: 1, formatWarning: false } }, 201)))) {
    document.body.innerHTML = '<button data-suggest-key="a">建議修改</button>';
    render(<SuggestDialog modId="m" fetchImpl={fetchImpl as never} />);
    return fetchImpl;
  }

  it('opens from a row button, submits after Turnstile, and confirms', async () => {
    const fetchImpl = mount();
    await userEvent.click(screen.getByText('建議修改', { selector: 'button[data-suggest-key]' }));
    expect(await screen.findByText('Apple %s')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('建議譯文'));
    await userEvent.type(screen.getByLabelText('建議譯文'), '紅蘋果 %s');
    await userEvent.click(screen.getByText('通過驗證'));
    await userEvent.click(screen.getByRole('button', { name: '送出建議' }));
    expect(await screen.findByText(/感謝/)).toBeInTheDocument();
    const post = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/api/v1/suggestions'));
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({ modId: 'm', key: 'a', proposed: '紅蘋果 %s', turnstileToken: 'tok' });
  });

  it('warns about format codes before submitting', async () => {
    mount();
    await userEvent.click(screen.getByText('建議修改', { selector: 'button[data-suggest-key]' }));
    await userEvent.clear(await screen.findByLabelText('建議譯文'));
    await userEvent.type(screen.getByLabelText('建議譯文'), '紅蘋果');
    expect(screen.getByText(/格式碼/)).toBeInTheDocument();
  });

  it('searches all entries of the mod', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: '搜尋本模組所有條目' }));
    await userEvent.type(await screen.findByLabelText('搜尋條目'), 'banana');
    await waitFor(() => expect(screen.getByText('Banana')).toBeInTheDocument());
    expect(screen.queryByText('Apple %s')).not.toBeInTheDocument();
  });
});
