import { useHydratedCart } from './cartStore';

export default function CartBadge() {
  const { items } = useHydratedCart();
  if (items.length === 0) return null;
  return (
    <span className="rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white" aria-label={`${items.length} 個模組`}>
      {items.length}
    </span>
  );
}
