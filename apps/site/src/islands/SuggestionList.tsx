import { useEffect, useState } from 'react';
import { t } from '../i18n/zh-TW';
import { apiGet, type FetchLike } from './api';

interface MySuggestion {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly proposed: string;
  readonly status: string;
  readonly reviewNote: string | null;
}

const STATUS: Readonly<Record<string, string>> = t.account.status;

function statusText(s: MySuggestion): string {
  const label = Object.hasOwn(STATUS, s.status) ? STATUS[s.status] : s.status;
  return s.reviewNote ? `${label}：${s.reviewNote}` : `${label}`;
}

/** 目前使用者（未登入時為同一網路位置的匿名）送出的建議與狀態 */
export default function SuggestionList({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const [state, setState] = useState<readonly MySuggestion[] | 'loading' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    void apiGet<{ suggestions: MySuggestion[] }>('/api/v1/me/suggestions', fetchImpl).then((r) => {
      if (alive) setState(r.ok ? r.data.suggestions : 'error');
    });
    return () => { alive = false; };
  }, [fetchImpl]);

  if (state === 'loading') return <p className="text-muted">{t.suggest.loading}</p>;
  if (state === 'error') return <p role="alert" className="text-danger">{t.account.loadFailed}</p>;
  if (state.length === 0) return <p className="text-muted">{t.account.empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {state.map((s) => (
        <li key={s.id} className="py-2">
          <div className="text-xs text-muted"><code>{s.modId}</code> · <code>{s.key}</code></div>
          <div>{s.proposed}</div>
          <div className="text-xs">{statusText(s)}</div>
        </li>
      ))}
    </ul>
  );
}
