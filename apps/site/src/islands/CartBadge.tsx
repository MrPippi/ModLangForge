import { t } from '../i18n/zh-TW';
import { useHydratedCart } from './cartStore';

/** 絕對定位於導覽連結右上角，水合後出現不會推擠版面 */
export default function CartBadge() {
  const { items } = useHydratedCart();
  if (items.length === 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute top-0.5 right-0 min-w-5 rounded-sm border-2 border-surface bg-primary px-1 text-center text-[11px] leading-4 font-bold text-on-primary"
      >
        {items.length}
      </span>
      <span className="sr-only">{t.common.cartCount(items.length)}</span>
    </>
  );
}
