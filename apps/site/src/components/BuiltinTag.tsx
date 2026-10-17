import { t } from '../i18n/zh-TW';

/** 內建繁中小標籤：與 TranslationTag 同尺寸，用 info 色系 */
export function BuiltinTag({ className = '' }: { readonly className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-sm bg-info-soft px-1.5 py-0.5 text-xs font-medium text-info ${className}`.trim()}>
      {t.builtin.tag}
    </span>
  );
}
