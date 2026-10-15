import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuggestDialog from './SuggestDialog';
import { submitSuggestion } from './suggestApi';

const turnstile = vi.hoisted(() => ({ mounts: 0 }));
vi.mock('./TurnstileWidget', async () => {
  const { useRef } = await import('react');
  function FakeTurnstile({ onToken }: { onToken: (t: string) => void }) {
    const n = useRef(0);
    if (n.current === 0) n.current = ++turnstile.mounts;
    return <button type="button" onClick={() => onToken(`tok${n.current}`)}>通過驗證</button>;
  }
  return { default: FakeTurnstile };
});

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
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({ modId: 'm', key: 'a', proposed: '紅蘋果 %s', turnstileToken: expect.stringMatching(/^tok\d+$/) });
  });

  it('warns about format codes before submitting', async () => {
    mount();
    await userEvent.click(screen.getByText('建議修改', { selector: 'button[data-suggest-key]' }));
    await userEvent.clear(await screen.findByLabelText('建議譯文'));
    await userEvent.type(screen.getByLabelText('建議譯文'), '紅蘋果');
    expect(screen.getByText(/特殊符號/)).toBeInTheDocument();
  });

  it('searches all entries of the mod', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: '搜尋這個模組的所有文字' }));
    await userEvent.type(await screen.findByLabelText('搜尋文字'), 'banana');
    await waitFor(() => expect(screen.getByText('Banana')).toBeInTheDocument());
    expect(screen.queryByText('Apple %s')).not.toBeInTheDocument();
  });

  it('requires a fresh Turnstile token after a failed submit', async () => {
    let posts = 0;
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('.json')) return jsonRes(modJson);
      posts += 1;
      return posts === 1
        ? jsonRes({ ok: false, error: { code: 'rate_limited', message: '太頻繁' } }, 429)
        : jsonRes({ ok: true, data: { id: 1, formatWarning: false } }, 201);
    });
    mount(fetchImpl);
    await userEvent.click(screen.getByText('建議修改', { selector: 'button[data-suggest-key]' }));
    await userEvent.clear(await screen.findByLabelText('建議譯文'));
    await userEvent.type(screen.getByLabelText('建議譯文'), '紅蘋果 %s');
    await userEvent.click(screen.getByText('通過驗證'));
    await userEvent.click(screen.getByRole('button', { name: '送出建議' }));
    expect(await screen.findByText('太頻繁')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '送出建議' }));
    expect(await screen.findByText('請先完成人機驗證。')).toBeInTheDocument();
    expect(posts).toBe(1);
    await userEvent.click(screen.getByText('通過驗證'));
    await userEvent.click(screen.getByRole('button', { name: '送出建議' }));
    expect(await screen.findByText(/感謝/)).toBeInTheDocument();
    const bodies = fetchImpl.mock.calls.filter(([u]) => u.endsWith('/api/v1/suggestions')).map(([, i]) => JSON.parse(String(i?.body)).turnstileToken);
    expect(bodies[0]).not.toBe(bodies[1]);
  });

  it('moves focus in, closes on Escape and restores focus', async () => {
    mount();
    const opener = screen.getByText('建議修改', { selector: 'button[data-suggest-key]' });
    await userEvent.click(opener);
    expect(await screen.findByLabelText('建議譯文')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('focuses the search input and shows loading text', async () => {
    mount(vi.fn(async () => { await new Promise((r) => setTimeout(r, 50)); return jsonRes(modJson); }));
    await userEvent.click(screen.getByRole('button', { name: '搜尋這個模組的所有文字' }));
    expect(screen.getByText('載入中…')).toBeInTheDocument();
    expect(await screen.findByLabelText('搜尋文字')).toHaveFocus();
  });

  it('shows a no-match message when the clicked key is not in the loaded entries', async () => {
    document.body.innerHTML = '<button data-suggest-key="ghost">建議修改</button>';
    render(<SuggestDialog modId="m" fetchImpl={vi.fn(async () => jsonRes(modJson)) as never} />);
    await userEvent.click(screen.getByText('建議修改', { selector: 'button[data-suggest-key]' }));
    expect(await screen.findByText('找不到符合的文字。')).toBeInTheDocument();
  });
});
