import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMe } from '../islands/api';
import { failure, routeFetch } from '../admin/testFetch';
import MeApp from './MeApp';
import { ME_CHANGED_EVENT } from './meApi';

const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';
const PROFILE = { id: 5, displayName: '史蒂夫', isPublic: true, minecraftName: null, minecraftUuid: null, minecraftVerified: false };
const ME = { user: { id: 5, displayName: '史蒂夫', role: 'contributor', identities: [] }, csrfToken: 'csrf' };
const MINE = { suggestions: [{ id: 1, modId: 'create', key: 'a', proposed: '齒輪', status: 'published', reviewNote: null }] };

type Handler = (url: string, init?: RequestInit) => unknown;
function mount(extra: Record<string, Handler> = {}, me: unknown = ME) {
  // 儲存後（ME_CHANGED_EVENT）頁面會重新載入，所以讓假伺服器記住最後一次儲存的個人資料
  let stored: unknown = PROFILE;
  const remember = ([key, handler]: [string, Handler]): [string, Handler] =>
    key.startsWith('POST ') ? [key, (url, init) => {
      const reply = handler(url, init) as { profile?: unknown };
      if (reply.profile) stored = reply.profile;
      return reply;
    }] : [key, handler];
  const fetchImpl = routeFetch({
    'GET /api/v1/me/profile': () => ({ profile: stored }),
    'GET /api/v1/me/suggestions': () => MINE,
    ...Object.fromEntries(Object.entries(extra).map(remember)),
  }, me);
  render(<MeApp fetchImpl={fetchImpl as never} />);
  return fetchImpl;
}
const bodyOf = (fetchImpl: ReturnType<typeof mount>, path: string) =>
  JSON.parse(String(fetchImpl.mock.calls.find(([u, i]) => u === path && i?.method === 'POST')?.[1]?.body));

beforeEach(() => resetMe());
afterEach(() => vi.restoreAllMocks());

describe('MeApp', () => {
  it('asks anonymous visitors to log in but still lists their anonymous suggestions', async () => {
    mount({ 'GET /api/v1/me/profile': () => failure('login_required', '請先登入。', 401) }, { user: null, csrfToken: 'csrf' });
    expect(await screen.findByText(/請從右上角登入/)).toBeInTheDocument();
    expect(await screen.findByText('齒輪')).toBeInTheDocument();
    expect(screen.getByText('已發佈')).toBeInTheDocument();
    expect(screen.queryByLabelText('顯示名稱')).not.toBeInTheDocument();
  });

  it('shows a load error', async () => {
    mount({ 'GET /api/v1/me/profile': () => failure('internal', 'x', 500) });
    expect(await screen.findByRole('alert')).toHaveTextContent('載入失敗');
  });

  it('sends only the public flag when the name was not edited', async () => {
    const longName = '字'.repeat(40);
    const fetchImpl = mount({
      'GET /api/v1/me/profile': () => ({ profile: { ...PROFILE, displayName: longName } }),
      'POST /api/v1/me/profile': () => ({ profile: { ...PROFILE, displayName: longName, isPublic: false } }),
    });
    await userEvent.click(await screen.findByLabelText(/公開署名/));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已儲存。');
    expect(bodyOf(fetchImpl, '/api/v1/me/profile')).toEqual({ isPublic: false });
  });

  it('counts the name by characters, not UTF-16 units', async () => {
    const astral = '𠀀'.repeat(32);
    const fetchImpl = mount({ 'POST /api/v1/me/profile': () => ({ profile: { ...PROFILE, displayName: astral } }) });
    const box = await screen.findByLabelText('顯示名稱');
    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste('𠀀'.repeat(32));
    expect(box).toHaveValue('𠀀'.repeat(32));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已儲存。');
    expect(bodyOf(fetchImpl, '/api/v1/me/profile')).toMatchObject({ displayName: '𠀀'.repeat(32) });
    await userEvent.click(box);
    await userEvent.paste('𠀀');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('最多 32 個字');
    expect(fetchImpl.mock.calls.filter(([u, i]) => u === '/api/v1/me/profile' && i?.method === 'POST')).toHaveLength(1);
  });

  it('returns to the logged-out state when the account menu logs out', async () => {
    let loggedOut = false;
    mount({ 'GET /api/v1/me/profile': () => (loggedOut ? failure('login_required', '請先登入。', 401) : { profile: PROFILE }) });
    expect(await screen.findByLabelText('顯示名稱')).toBeInTheDocument();
    loggedOut = true;
    window.dispatchEvent(new Event(ME_CHANGED_EVENT));
    expect(await screen.findByText(/請從右上角登入/)).toBeInTheDocument();
    expect(screen.queryByLabelText('顯示名稱')).not.toBeInTheDocument();
  });

  it('saves the display name and public flag with CSRF, then announces the change', async () => {
    const onChange = vi.fn();
    window.addEventListener(ME_CHANGED_EVENT, onChange);
    const fetchImpl = mount({ 'POST /api/v1/me/profile': () => ({ profile: { ...PROFILE, displayName: '艾力克斯', isPublic: false } }) });
    const box = await screen.findByLabelText('顯示名稱');
    await userEvent.clear(box);
    await userEvent.type(box, '艾力克斯');
    await userEvent.click(screen.getByLabelText(/公開署名/));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已儲存。');
    expect(bodyOf(fetchImpl, '/api/v1/me/profile')).toEqual({ displayName: '艾力克斯', isPublic: false });
    expect(fetchImpl.mock.calls.find(([u, i]) => u === '/api/v1/me/profile' && i?.method === 'POST')?.[1])
      .toMatchObject({ headers: { 'X-CSRF-Token': 'csrf' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    window.removeEventListener(ME_CHANGED_EVENT, onChange);
  });

  it('shows server validation errors', async () => {
    mount({ 'POST /api/v1/me/profile': () => failure('display_name_empty', '顯示名稱不能空白。') });
    await userEvent.clear(await screen.findByLabelText('顯示名稱'));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('顯示名稱不能空白。');
  });

  it('looks up a Minecraft name and shows the avatar with an unverified badge', async () => {
    const fetchImpl = mount({
      'POST /api/v1/me/minecraft': () => ({ profile: { ...PROFILE, minecraftName: 'Steve', minecraftUuid: STEVE_UUID } }),
    });
    await userEvent.type(await screen.findByLabelText('玩家名稱'), 'steve');
    await userEvent.click(screen.getByRole('button', { name: '確認並儲存' }));
    expect(await screen.findByText('Steve')).toBeInTheDocument();
    expect(screen.getByText('未驗證', { exact: true })).toBeInTheDocument();
    expect(bodyOf(fetchImpl, '/api/v1/me/minecraft')).toEqual({ name: 'steve' });
    await waitFor(() => expect(document.querySelector('img')?.getAttribute('src')).toBe(`https://mc-heads.net/avatar/${STEVE_UUID}/48`));
    expect(document.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('removes the Minecraft name', async () => {
    const withMc = { ...PROFILE, minecraftName: 'Steve', minecraftUuid: STEVE_UUID };
    const fetchImpl = mount({
      'GET /api/v1/me/profile': () => ({ profile: withMc }),
      'POST /api/v1/me/minecraft': () => ({ profile: PROFILE }),
    });
    await userEvent.click(await screen.findByRole('button', { name: '移除' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已移除 Minecraft 名稱。');
    expect(bodyOf(fetchImpl, '/api/v1/me/minecraft')).toEqual({ name: null });
  });

  it('reports a name Mojang does not know', async () => {
    mount({ 'POST /api/v1/me/minecraft': () => failure('minecraft_not_found', '找不到這個 Minecraft 名稱。', 404) });
    await userEvent.type(await screen.findByLabelText('玩家名稱'), 'nobody');
    await userEvent.click(screen.getByRole('button', { name: '確認並儲存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('找不到這個 Minecraft 名稱。');
  });
});
