import type { ModSummary } from '../lib/summary';
import { BuiltinTag } from './BuiltinTag';
import { TranslationTag } from './TranslationTag';

/** 列表用的右上標籤：內建條目顯示「內建繁中」，其餘顯示翻譯進度 */
export function ModTag({ mod, className }: { readonly mod: ModSummary; readonly className?: string }) {
  if (mod.status === 'builtin') return <BuiltinTag className={className} />;
  return <TranslationTag translated={mod.translated} total={mod.total} percent={mod.percent} className={className} />;
}
