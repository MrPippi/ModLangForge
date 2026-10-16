// apps/site/src/contributors/ContributorProfile.tsx
import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import type { FetchLike } from '../islands/api';
import { contributorsUrl, modUrl, SITE_SHORT_NAME } from '../lib/config';
import { contributorIdFromPath, getContributor, type ContributorProfileData } from './contributorsApi';
import { cs } from './strings';

type State = ContributorProfileData | 'loading' | 'missing' | 'error';

function Details({ p }: { readonly p: ContributorProfileData }) {
  return (
    <article className="grid gap-4">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar uuid={p.minecraftUuid} name={p.displayName} size={64} />
        <div>
          <h2 className="text-xl font-bold">{p.displayName}</h2>
          {p.minecraftName && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <span>{p.minecraftName}</span>
              {!p.minecraftVerified && <span className="rounded-sm border border-line px-1.5 text-xs">{cs.unverified}</span>}
            </p>
          )}
          <p className="text-sm">{cs.published(p.published)}</p>
        </div>
      </header>
      <section aria-labelledby="contributor-mods">
        <h3 id="contributor-mods" className="mb-2 font-bold">{cs.mods}</h3>
        <ul className="divide-y divide-line">
          {p.mods.map((x) => (
            <li key={x.modId} className="flex items-center justify-between py-2">
              <a className="link" href={modUrl(x.modId)}>{x.modId}</a>
              <span className="text-sm text-muted">{cs.published(x.count)}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export default function ContributorProfile({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const [id] = useState(() => contributorIdFromPath(window.location.pathname));
  const [state, setState] = useState<State>(id === null ? 'missing' : 'loading');
  useEffect(() => {
    if (id === null) return undefined;
    let alive = true;
    void getContributor(id, fetchImpl).then((r) => {
      if (!alive) return;
      if (r.ok) setState(r.data.contributor);
      else setState(r.code === 'contributor_not_found' || r.code === 'invalid_body' ? 'missing' : 'error');
    });
    return () => { alive = false; };
  }, [id, fetchImpl]);
  useEffect(() => {
    if (typeof state === 'object') document.title = `${state.displayName} | ${cs.title} | ${SITE_SHORT_NAME}`;
  }, [state]);

  return (
    <div className="grid gap-6">
      {state === 'loading' && <p className="text-muted">{cs.loading}</p>}
      {state === 'error' && <p role="alert" className="text-danger">{cs.loadFailed}</p>}
      {state === 'missing' && <p>{cs.notFound}</p>}
      {typeof state === 'object' && <Details p={state} />}
      <p><a className="link" href={contributorsUrl()}>{cs.back}</a></p>
    </div>
  );
}
