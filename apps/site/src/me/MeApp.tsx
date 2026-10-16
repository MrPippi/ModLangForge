import { useEffect, useMemo, useState } from 'react';
import type { FetchLike } from '../islands/api';
import SuggestionList from '../islands/SuggestionList';
import { createMeApi, ME_CHANGED_EVENT, type UserProfile } from './meApi';
import MinecraftForm from './MinecraftForm';
import ProfileForm from './ProfileForm';
import { m } from './strings';

type State = UserProfile | 'loading' | 'anonymous' | 'error';

export default function MeApp({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const api = useMemo(() => createMeApi(fetchImpl), [fetchImpl]);
  const [state, setState] = useState<State>('loading');
  useEffect(() => {
    let alive = true;
    const load = () => void api.profile().then((r) => {
      if (!alive) return;
      if (r.ok) setState(r.data.profile);
      else setState(r.code === 'login_required' ? 'anonymous' : 'error');
    });
    load();
    // 在帳號選單登出（或換帳號）後重新載入，避免頁面還顯示舊使用者的表單
    window.addEventListener(ME_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(ME_CHANGED_EVENT, load);
    };
  }, [api]);

  if (state === 'loading') return <p className="text-muted">{m.loading}</p>;
  if (state === 'error') return <p role="alert" className="text-danger">{m.loadFailed}</p>;
  return (
    <div className="grid gap-10">
      {state === 'anonymous' ? <p>{m.needLogin}</p> : (
        <>
          <ProfileForm api={api} profile={state} onSaved={setState} />
          <MinecraftForm api={api} profile={state} onSaved={setState} />
        </>
      )}
      <section aria-labelledby="my-suggestions-title">
        <h2 id="my-suggestions-title" className="mb-2 text-lg font-bold">{m.mySuggestions}</h2>
        {state === 'anonymous' && <p className="mb-2 text-xs text-muted">{m.anonymousNote}</p>}
        <SuggestionList fetchImpl={fetchImpl} />
      </section>
    </div>
  );
}
