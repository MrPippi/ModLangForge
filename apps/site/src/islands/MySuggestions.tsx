import { createPortal } from 'react-dom';
import { t } from '../i18n/zh-TW';
import type { FetchLike } from './api';
import SuggestionList from './SuggestionList';
import { useModal } from './useModal';

export default function MySuggestions({ fetchImpl = fetch, loggedIn, onClose }: { readonly fetchImpl?: FetchLike; readonly loggedIn: boolean; readonly onClose: () => void }) {
  const box = useModal(true, onClose);
  // 掛到 body：Header 的 backdrop-blur 會讓 fixed 子層以 Header 為定位基準
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t.account.mySuggestions} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={box} tabIndex={-1} className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">{t.account.mySuggestions}</h3>
          <button type="button" className="link inline-flex min-h-11 items-center text-sm" onClick={onClose}>{t.account.close}</button>
        </div>
        {!loggedIn && <p className="mb-2 text-xs text-muted">{t.account.anonymousNote}</p>}
        <SuggestionList fetchImpl={fetchImpl} />
      </div>
    </div>,
    document.body,
  );
}
