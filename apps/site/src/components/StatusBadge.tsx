import type { TranslationStatus } from '@mlf/core/catalog';
import { STATUS_LABELS } from '../lib/format';

const STYLES: Readonly<Record<TranslationStatus, string>> = {
  machine: 'border-warn/40 bg-warn-soft text-warn',
  partial: 'border-info/40 bg-info-soft text-info',
  reviewed: 'border-primary/40 bg-primary-soft text-link',
};

export function StatusBadge({ status }: { readonly status: TranslationStatus }) {
  return (
    <span className={`inline-block shrink-0 rounded-sm border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
