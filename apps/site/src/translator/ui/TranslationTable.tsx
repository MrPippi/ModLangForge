import { useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { t } from '../i18n/zh-TW';
import type { SearchHit } from './filterEntries';
import { TranslationRow } from './TranslationRow';

const ESTIMATED_ROW_PX = 88;
const OVERSCAN = 8;
/** jsdom／首次渲染時沒有版面尺寸，先假設一個可視區 */
const INITIAL_RECT = { width: 1024, height: 2048 };

interface TranslationTableProps {
  readonly hits: readonly SearchHit[];
  readonly showModId: boolean;
  readonly showReference: boolean;
  readonly onCommit: (modId: string, key: string, target: string) => void;
  /** 傳給每一列；false 表示只在明確儲存時提交 */
  readonly autoCommit?: boolean;
}

export function TranslationTable({ hits, showModId, showReference, onCommit, autoCommit = true }: TranslationTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual 回傳的函式不可被 memo，這是預期行為
  const virtualizer = useVirtualizer({
    count: hits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: OVERSCAN,
    initialRect: INITIAL_RECT,
  });

  const onNavigate = useCallback(
    (index: number) => {
      if (index < 0 || index >= hits.length) return;
      virtualizer.scrollToIndex(index);
      requestAnimationFrame(() => {
        parentRef.current?.querySelector<HTMLTextAreaElement>(`[data-row="${index}"] textarea`)?.focus();
      });
    },
    [hits.length, virtualizer],
  );

  if (hits.length === 0) {
    return <p className="p-10 text-center text-muted">{t.table.noResults}</p>;
  }

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const hit = hits[item.index];
          if (!hit) return null;
          return (
            <div
              key={`${hit.modId}:${hit.entry.key}`}
              ref={virtualizer.measureElement}
              data-index={item.index}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}
            >
              <TranslationRow
                index={item.index}
                modId={hit.modId}
                entry={hit.entry}
                showModId={showModId}
                showReference={showReference}
                onCommit={onCommit}
                onNavigate={onNavigate}
                autoCommit={autoCommit}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
