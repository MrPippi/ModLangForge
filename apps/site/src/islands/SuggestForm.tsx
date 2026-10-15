import { useCallback, useState } from 'react';
import { checkFormat } from '@mlf/core/validate';
import { validateSuggestion } from '@mlf/core/review';
import { t } from '../i18n/zh-TW';
import { submitSuggestion } from './suggestApi';
import TurnstileWidget from './TurnstileWidget';

const REJECTION_TEXT = {
  empty: '譯文不能是空白。',
  unchanged: '建議內容與目前譯文相同。',
  too_long: '譯文太長了。',
  note_too_long: '備註太長了。',
} as const;

interface FormProps {
  readonly modId: string;
  readonly entryKey: string;
  readonly source: string;
  readonly current: string | null;
  readonly fetchImpl: typeof fetch;
}

function formatWarningText(source: string, proposed: string): string | null {
  const issue = checkFormat(source, proposed);
  if (!issue) return null;
  return [...issue.missing.map((x) => `缺少 ${x}`), ...issue.extra.map((x) => `多出 ${x}`)].join('、');
}

export default function SuggestForm({ modId, entryKey, source, current, fetchImpl }: FormProps) {
  const [proposed, setProposed] = useState(current ?? '');
  const [note, setNote] = useState('');
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState(0);
  const onToken = useCallback((tok: string) => setToken(tok), []);

  const verdict = validateSuggestion({ source, current, proposed, note });
  const warning = formatWarningText(source, proposed);

  const send = async () => {
    if (!verdict.ok) return;
    if (token === '') {
      setError(t.suggest.needTurnstile);
      return;
    }
    setPhase('sending');
    setError(null);
    const result = await submitSuggestion({ modId, key: entryKey, proposed, note: note || undefined, turnstileToken: token }, fetchImpl);
    if (result.ok) {
      setPhase('done');
    } else {
      setPhase('idle');
      setError(result.message);
      // Turnstile token 只能使用一次：清除並重新掛載元件以取得新的挑戰
      setToken('');
      setChallenge((n) => n + 1);
    }
  };

  if (phase === 'done') return <p className="text-emerald-700 dark:text-emerald-300">{t.suggest.thanks}</p>;

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <p className="text-xs text-slate-400"><code>{entryKey}</code></p>
      <div><div className="text-xs text-slate-500">{t.suggest.original}</div><div>{source}</div></div>
      <div><div className="text-xs text-slate-500">{t.suggest.current}</div><div>{current ?? t.modPage.untranslated}</div></div>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t.suggest.proposed}</span>
        <textarea autoFocus className="input min-h-20" aria-label={t.suggest.proposed} value={proposed} onChange={(e) => setProposed(e.target.value)} />
      </label>
      {warning && <p className="text-xs text-amber-600">{t.suggest.formatWarning(warning)}</p>}
      {!verdict.ok && proposed !== (current ?? '') && <p className="text-xs text-red-600">{REJECTION_TEXT[verdict.reason]}</p>}
      <label className="flex flex-col gap-1 text-sm">
        <span>{t.suggest.note}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <TurnstileWidget key={challenge} onToken={onToken} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={!verdict.ok || phase === 'sending'}>
        {phase === 'sending' ? t.suggest.submitting : t.suggest.submit}
      </button>
    </form>
  );
}
