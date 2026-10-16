// apps/site/src/contributors/contributors.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { resetMe } from '../islands/api';
import { failure, routeFetch } from '../admin/testFetch';
import ContributorProfile from './ContributorProfile';
import ContributorsList from './ContributorsList';
import { contributorIdFromPath, modFilterFromSearch } from './contributorsApi';

const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';
const RANKING = [
  { id: 7, displayName: 'Alice', minecraftUuid: STEVE_UUID, published: 3, mods: 2, topMods: ['create', 'jei'] },
  { id: 9, displayName: 'Bob', minecraftUuid: null, published: 1, mods: 1, topMods: ['create'] },
];
const ALICE = {
  id: 7, displayName: 'Alice', minecraftName: 'Steve', minecraftUuid: STEVE_UUID, minecraftVerified: false,
  published: 3, mods: [{ modId: 'create', count: 2 }, { modId: 'jei', count: 1 }],
};

beforeEach(() => resetMe());
afterEach(() => window.history.pushState({}, '', '/'));

describe('URL helpers', () => {
  it('parses contributor ids from the path', () => {
    expect(contributorIdFromPath('/contributors/12/')).toBe(12);
    expect(contributorIdFromPath('/contributors/12')).toBe(12);
    expect(contributorIdFromPath('/contributors/0/')).toBeNull();
    expect(contributorIdFromPath('/contributors/abc/')).toBeNull();
    expect(contributorIdFromPath('/contributors/profile/')).toBeNull();
    expect(contributorIdFromPath('/contributors/9999999999999999/')).toBeNull();
  });

  it('accepts only valid mod ids from ?mod=', () => {
    expect(modFilterFromSearch('?mod=create')).toBe('create');
    expect(modFilterFromSearch('?mod=..%2Fx')).toBeNull();
    expect(modFilterFromSearch('')).toBeNull();
  });
});

describe('ContributorsList', () => {
  it('ranks contributors with profile links and avatars', async () => {
    render(<ContributorsList fetchImpl={routeFetch({ 'GET /api/v1/contributors': () => ({ contributors: RANKING }) }) as never} />);
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]!).getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/contributors/7/');
    expect(items[0]).toHaveTextContent('已發佈 3 條');
    expect(items[0]).toHaveTextContent('2 個模組');
    expect(items[0]).toHaveTextContent('create、jei');
    expect(items[0]!.querySelector('img')?.getAttribute('src')).toBe(`https://mc-heads.net/avatar/${STEVE_UUID}/32`);
    expect(items[1]!.querySelector('img')).toBeNull();
  });

  it('filters by ?mod= and links back to the full list', async () => {
    window.history.pushState({}, '', '/contributors/?mod=create');
    const fetchImpl = routeFetch({ 'GET /api/v1/contributors': () => ({ contributors: [] }) });
    render(<ContributorsList fetchImpl={fetchImpl as never} />);
    expect(await screen.findByText('這個模組還沒有公開署名的社群貢獻。')).toBeInTheDocument();
    expect(screen.getByText('模組 create 的貢獻者')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看全部貢獻者' })).toHaveAttribute('href', '/contributors/');
    expect(fetchImpl.mock.calls.some(([u]) => u === '/api/v1/contributors?modId=create')).toBe(true);
  });

  it('shows a load error', async () => {
    render(<ContributorsList fetchImpl={routeFetch({ 'GET /api/v1/contributors': () => failure('internal', 'x', 500) }) as never} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('載入失敗');
  });
});

describe('ContributorProfile', () => {
  it('loads the contributor from the path and lists their mods', async () => {
    window.history.pushState({}, '', '/contributors/7/');
    render(<ContributorProfile fetchImpl={routeFetch({ 'GET /api/v1/contributors/7': () => ({ contributor: ALICE }) }) as never} />);
    expect(await screen.findByRole('heading', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByText('Steve')).toBeInTheDocument();
    expect(screen.getByText('未驗證')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'create' })).toHaveAttribute('href', '/mods/create/');
    expect(screen.getByText('已發佈 3 條')).toBeInTheDocument();
    expect(document.title).toContain('Alice');
  });

  it('says not found for hidden contributors and for the bare shell path', async () => {
    window.history.pushState({}, '', '/contributors/8/');
    const fetchImpl = routeFetch({ 'GET /api/v1/contributors/8': () => failure('contributor_not_found', '找不到這位貢獻者。', 404) });
    const { unmount } = render(<ContributorProfile fetchImpl={fetchImpl as never} />);
    expect(await screen.findByText(/找不到這位貢獻者/)).toBeInTheDocument();
    unmount();
    window.history.pushState({}, '', '/contributors/profile/');
    const untouched = routeFetch({});
    render(<ContributorProfile fetchImpl={untouched as never} />);
    expect(await screen.findByText(/找不到這位貢獻者/)).toBeInTheDocument();
    expect(untouched.mock.calls.filter(([u]) => u.startsWith('/api/v1/contributors'))).toHaveLength(0);
  });
});
