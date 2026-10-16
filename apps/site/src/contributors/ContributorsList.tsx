// apps/site/src/contributors/ContributorsList.tsx
import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import type { FetchLike } from '../islands/api';
import { contributorsUrl, contributorUrl, modUrl } from '../lib/config';
import { listContributors, modFilterFromSearch, type ContributorSummary } from './contributorsApi';
import { cs } from './strings';

function Ranking({ list }: { readonly list: readonly ContributorSummary[] }) {
  return (
    <ol className="divide-y divide-line">
      {list.map((p, i) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
          <span aria-hidden="true" className="w-8 text-right font-pixel text-muted tabular-nums">{i + 1}</span>
          <Avatar uuid={p.minecraftUuid} name={p.displayName} size={32} />
          <a className="link font-semibold" href={contributorUrl(p.id)}>{p.displayName}</a>
          <span className="ml-auto text-sm text-muted">{cs.published(p.published)} · {cs.modCount(p.mods)}</span>
          {p.topMods.length > 0 && <span className="w-full pl-11 text-xs text-muted">{p.topMods.join('、')}</span>}
        </li>
      ))}
    </ol>
  );
}

export default function ContributorsList({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const [modId] = useState(() => modFilterFromSearch(window.location.search));
  const [state, setState] = useState<readonly ContributorSummary[] | 'loading' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    void listContributors(modId, fetchImpl).then((r) => {
      if (alive) setState(r.ok ? r.data.contributors : 'error');
    });
    return () => { alive = false; };
  }, [modId, fetchImpl]);

  return (
    <div className="grid gap-4">
      {modId && (
        <p className="flex flex-wrap gap-x-3 text-sm">
          <span className="font-semibold">{cs.forMod(modId)}</span>
          <a className="link" href={contributorsUrl()}>{cs.showAll}</a>
          <a className="link" href={modUrl(modId)}>{cs.modPage}</a>
        </p>
      )}
      {state === 'loading' && <p className="text-muted">{cs.loading}</p>}
      {state === 'error' && <p role="alert" className="text-danger">{cs.loadFailed}</p>}
      {typeof state !== 'string' && state.length === 0 && <p className="text-muted">{modId ? cs.emptyMod : cs.empty}</p>}
      {typeof state !== 'string' && state.length > 0 && <Ranking list={state} />}
      <p className="text-xs text-muted">{cs.note}</p>
    </div>
  );
}
