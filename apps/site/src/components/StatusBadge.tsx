import type { TranslationStatus } from '@mlf/core/catalog';
import { STATUS_LABELS } from '../lib/format';

const STYLES: Readonly<Record<TranslationStatus, string>> = {
  machine: 'border-warn/40 bg-warn-soft text-warn',
  partial: 'border-info/40 bg-info-soft text-info',
  reviewed: 'border-primary/40 bg-primary-soft text-link',
};

export function StatusBadge({ status, className = 'px-2 text-sm' }: { readonly status: TranslationStatus; readonly className?: string }) {
  return (
    <span className={`inline-block shrink-0 rounded-sm border py-0.5 font-medium whitespace-nowrap ${className} ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
