import { type KeyboardEvent, useState } from 'react';
import { checkFormat } from '@mlf/core/validate';
import type { TranslationEntry } from '@mlf/core';
import { t } from '../i18n/zh-TW';

interface TranslationRowProps {
  readonly index: number;
  readonly modId: string;
  readonly entry: TranslationEntry;
  readonly showModId: boolean;
  readonly showReference: boolean;
  readonly onCommit: (modId: string, key: string, target: string) => void;
  readonly onNavigate: (index: number) => void;
}

function WarningText({ source, target }: { readonly source: string; readonly target: string }) {
  const issue = checkFormat(source, target);
  if (!issue) return null;
  const parts = [
    ...(issue.missing.length > 0 ? [t.table.missing(issue.missing.join(' '))] : []),
    ...(issue.extra.length > 0 ? [t.table.extra(issue.extra.join(' '))] : []),
  ];
  return (
    <div className="mt-1 flex flex-wrap gap-2 text-xs text-amber-600">
      {parts.map((p) => <span key={p}>{p}</span>)}
    </div>
  );
}

const STATUS_DOT: Readonly<Record<TranslationEntry['status'], string>> = {
  translated: 'bg-emerald-500',
  untranslated: 'bg-slate-300',
  new: 'bg-sky-500',
  obsolete: 'bg-slate-200',
};

export function TranslationRow({ index, modId, entry, showModId, showReference, onCommit, onNavigate }: TranslationRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? entry.target;

  const commit = (text: string) => {
    setDraft(null);
    if (text !== entry.target) onCommit(modId, entry.key, text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commit(value);
      onNavigate(index + 1);
    } else if (e.ctrlKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      commit(value);
      onNavigate(index + (e.key === 'ArrowDown' ? 1 : -1));
    }
  };

  return (
    <div data-row={index} className="grid grid-cols-1 gap-2 border-b border-slate-200 px-3 py-2 md:grid-cols-2 dark:border-slate-700">
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[entry.status]}`} title={t.status[entry.status]} />
          <span className="truncate font-mono">{showModId ? `${modId} · ${entry.key}` : entry.key}</span>
        </div>
        <div className="mt-1 break-words whitespace-pre-wrap">{entry.source}</div>
        {showReference && entry.reference && <div className="mt-1 text-xs text-slate-500">{entry.reference}</div>}
      </div>
      <div>
        <textarea
          aria-label={`${t.table.target} ${entry.key}`}
          className="input min-h-10 w-full resize-y"
          rows={1}
          placeholder={t.table.placeholder}
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== null && commit(draft)}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-start justify-between gap-2">
          <WarningText source={entry.source} target={value} />
          <button type="button" className="ml-auto text-xs text-slate-500 hover:text-emerald-600" onClick={() => commit(entry.source)}>
            {t.table.copySource}
          </button>
        </div>
      </div>
    </div>
  );
}
