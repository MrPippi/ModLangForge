import { useEffect, useMemo, useState } from 'react';
import { loadMe, type FetchLike, type Me } from '../islands/api';
import { createAdminApi } from './adminApi';
import BlocksPanel from './BlocksPanel';
import DirectEditor from './DirectEditor';
import PublishPanel from './PublishPanel';
import ReviewQueue from './ReviewQueue';
import { s } from './strings';
import UsersPanel from './UsersPanel';

type Tab = keyof typeof s.tabs;
const TABS: readonly { readonly id: Tab; readonly adminOnly: boolean }[] = [
  { id: 'review', adminOnly: false },
  { id: 'edit', adminOnly: false },
  { id: 'publish', adminOnly: true },
  { id: 'users', adminOnly: true },
  { id: 'blocks', adminOnly: true },
];

export default function AdminApp({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const api = useMemo(() => createAdminApi(fetchImpl), [fetchImpl]);
  const [me, setMe] = useState<Me | 'error' | null>(null);
  const [tab, setTab] = useState<Tab>('review');
  useEffect(() => {
    void loadMe(fetchImpl).then((r) => setMe(r.ok ? r.data : 'error'));
  }, [fetchImpl]);

  if (me === null) return <p className="text-muted">{s.loading}</p>;
  if (me === 'error') return <p role="alert" className="text-danger">{s.loadFailed}</p>;
  if (!me.user) return <p>{s.needLogin}</p>;
  if (me.user.role === 'contributor') return <p>{s.forbidden}</p>;
  const isAdmin = me.user.role === 'admin';
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);

  return (
    <div>
      <div role="tablist" aria-label={s.title} className="mb-4 flex flex-wrap gap-2 border-b-2 border-line">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className="min-h-11 px-3 text-muted aria-selected:font-semibold aria-selected:text-fg" onClick={() => setTab(t.id)}>
            {s.tabs[t.id]}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={s.tabs[tab]}>
        {tab === 'review' && <ReviewQueue api={api} fetchImpl={fetchImpl} isAdmin={isAdmin} />}
        {tab === 'edit' && <DirectEditor api={api} fetchImpl={fetchImpl} />}
        {tab === 'publish' && isAdmin && <PublishPanel api={api} />}
        {tab === 'users' && isAdmin && <UsersPanel api={api} selfId={me.user.id} />}
        {tab === 'blocks' && isAdmin && <BlocksPanel api={api} />}
      </div>
    </div>
  );
}
