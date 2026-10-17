import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { checkFormat } from '@mlf/core/validate';
import type { FormatCheck } from '@mlf/core/ftbquests';
import { checkGlossary, findTerms, type GlossaryTerm } from '@mlf/core/glossary';
import type { TranslationEntry } from '@mlf/core';
import { t } from '../i18n/zh-TW';

/** 格式碼檢查；手冊條目傳 checkGuideFormat（型別定義在 core） */
export type { FormatCheck };

interface TranslationRowProps {
  readonly index: number;
  readonly modId: string;
  readonly entry: TranslationEntry;
  readonly showModId: boolean;
  readonly showReference: boolean;
  readonly terms?: readonly GlossaryTerm[];
  readonly onCommit: (modId: string, key: string, target: string) => void;
  readonly onNavigate: (index: number) => void;
  /** false：只在 Enter 或按「儲存」時提交，不在 blur／切換分頁／卸載時自動提交（管理員直接編輯用） */
  readonly autoCommit?: boolean;
  readonly check?: FormatCheck;
}

function WarningText({ source, target, check }: { readonly source: string; readonly target: string; readonly check: FormatCheck }) {
  const issue = check(source, target);
  if (!issue) return null;
  const parts = [
    ...(issue.missing.length > 0 ? [t.table.missing(issue.missing.join(' '))] : []),
    ...(issue.extra.length > 0 ? [t.table.extra(issue.extra.join(' '))] : []),
  ];
  return (
    <div className="mt-1 flex flex-wrap gap-2 text-xs text-warn">
      {parts.map((p) => <span key={p}>{p}</span>)}
    </div>
  );
}

/** 多行原文（例如 FTB 任務說明）時，編輯框一開始就顯示相同行數，最多 MAX_ROWS 行 */
const MAX_ROWS = 8;

function rowsFor(source: string): number {
  return Math.min(MAX_ROWS, source.split('\n').length);
}

const NO_TERMS: readonly GlossaryTerm[] = [];

function GlossaryHints({ source, target, terms }: { readonly source: string; readonly target: string; readonly terms: readonly GlossaryTerm[] }) {
  const matched = findTerms(source, terms);
  if (matched.length === 0) return null;
  const missing = new Set(checkGlossary(source, target, terms).map((i) => i.term));
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
      <span>{t.glossary.label}</span>
      {matched.map((term) =>
        missing.has(term) ? (
          <span key={term.en} data-missing title={t.glossary.missing} aria-label={`${term.en}→${term.zh}（${t.glossary.missing}）`} className="text-warn">
            <span aria-hidden="true">⚠</span>{term.en}→{term.zh}
          </span>
        ) : (
          <span key={term.en}>{term.en}→{term.zh}</span>
        ),
      )}
    </div>
  );
}

const STATUS_DOT: Readonly<Record<TranslationEntry['status'], string>> = {
  translated: 'bg-primary',
  untranslated: 'bg-line-strong/40',
  new: 'bg-info',
  obsolete: 'bg-line',
};

interface DraftSnapshot {
  draft: string | null;
  target: string;
  key: string;
  modId: string;
  onCommit: TranslationRowProps['onCommit'];
}

/**
 * 尚未提交的草稿在兩種情況下會遺失：列被虛擬捲動卸載（不會觸發 blur），
 * 以及頁面被關閉或切到背景。兩者都在此補提交。
 */
function useDraftSafety(snapshot: DraftSnapshot, enabled: boolean): void {
  const latest = useRef(snapshot);
  useEffect(() => {
    latest.current = snapshot;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const flush = () => {
      const s = latest.current;
      if (s.draft === null || s.draft === s.target) return;
      s.onCommit(s.modId, s.key, s.draft);
      latest.current = { ...s, target: s.draft };
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [enabled]);
}

export function TranslationRow({ index, modId, entry, showModId, showReference, terms = NO_TERMS, onCommit, onNavigate, autoCommit = true, check = checkFormat }: TranslationRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? entry.target;
  useDraftSafety({ draft, target: entry.target, key: entry.key, modId, onCommit }, autoCommit);

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
      if (autoCommit) commit(value);
      onNavigate(index + (e.key === 'ArrowDown' ? 1 : -1));
    }
  };

  return (
    <div data-row={index} className="grid grid-cols-1 gap-2 border-b-2 border-line px-3 py-3 md:grid-cols-2">
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className={`inline-block size-2 shrink-0 rounded-[1px] ${STATUS_DOT[entry.status]}`} title={t.status[entry.status]} />
          <span className="truncate font-mono">{showModId ? `${modId} · ${entry.key}` : entry.key}</span>
        </div>
        <div className="mt-1 break-words whitespace-pre-wrap">{entry.source}</div>
        <GlossaryHints source={entry.source} target={value} terms={terms} />
        {showReference && entry.reference && <div className="mt-1 text-xs text-muted">{entry.reference}</div>}
      </div>
      <div>
        <textarea
          aria-label={`${t.table.target} ${entry.key}`}
          className="input w-full resize-y py-2"
          rows={rowsFor(entry.source)}
          placeholder={t.table.placeholder}
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => autoCommit && draft !== null && commit(draft)}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-start justify-between gap-2">
          <WarningText source={entry.source} target={value} check={check} />
          <button type="button" className="ml-auto min-h-9 cursor-pointer rounded-sm px-2 text-xs text-muted hover:bg-surface-2 hover:text-link" onClick={() => (autoCommit ? commit(entry.source) : setDraft(entry.source))}>
            {t.table.copySource}
          </button>
          {!autoCommit && (
            <button type="button" className="min-h-9 cursor-pointer rounded-sm px-2 text-xs text-link hover:bg-surface-2 disabled:cursor-default disabled:text-muted" aria-label={t.table.saveRow(entry.key)} disabled={draft === null || draft === entry.target} onClick={() => draft !== null && commit(draft)}>
              {t.table.save}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
