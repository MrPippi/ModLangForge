import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/zh-TW';
import { apiGet, type FetchLike } from './api';
import { useModal } from './useModal';

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

export default function MySuggestions({ fetchImpl = fetch, loggedIn, onClose }: { readonly fetchImpl?: FetchLike; readonly loggedIn: boolean; readonly onClose: () => void }) {
  const [state, setState] = useState<readonly MySuggestion[] | 'loading' | 'error'>('loading');
  const box = useModal(true, onClose);
  useEffect(() => {
    let alive = true;
    void apiGet<{ suggestions: MySuggestion[] }>('/api/v1/me/suggestions', fetchImpl).then((r) => {
      if (alive) setState(r.ok ? r.data.suggestions : 'error');
    });
    return () => { alive = false; };
  }, [fetchImpl]);

  // 掛到 body：Header 的 backdrop-blur 會讓 fixed 子層以 Header 為定位基準
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t.account.mySuggestions} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={box} tabIndex={-1} className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">{t.account.mySuggestions}</h3>
          <button type="button" className="link inline-flex min-h-11 items-center text-sm" onClick={onClose}>{t.account.close}</button>
        </div>
        {!loggedIn && <p className="mb-2 text-xs text-muted">{t.account.anonymousNote}</p>}
        {state === 'loading' && <p className="text-muted">{t.suggest.loading}</p>}
        {state === 'error' && <p role="alert" className="text-danger">{t.account.loadFailed}</p>}
        {typeof state !== 'string' && state.length === 0 && <p className="text-muted">{t.account.empty}</p>}
        {typeof state !== 'string' && state.length > 0 && (
          <ul className="divide-y divide-line">
            {state.map((s) => (
              <li key={s.id} className="py-2">
                <div className="text-xs text-muted"><code>{s.modId}</code> · <code>{s.key}</code></div>
                <div>{s.proposed}</div>
                <div className="text-xs">{statusText(s)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
