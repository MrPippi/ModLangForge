interface Props {
  readonly src: string | null;
  readonly name: string;
  /** 顯示尺寸（px） */
  readonly size: number;
  readonly className?: string;
  /** 首屏的圖示不延遲載入 */
  readonly eager?: boolean;
}

/** 模組圖示；名稱已在旁邊顯示，所以圖片不另加替代文字。沒有圖示時顯示名稱首字 */
export function ModIcon({ src, name, size, className = '', eager = false }: Props) {
  const box = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-surface-2 ${className}`;
  if (src) {
    return <img src={src} alt="" width={size} height={size} loading={eager ? 'eager' : 'lazy'} decoding="async" className={`${box} object-contain`} />;
  }
  return (
    <span aria-hidden="true" className={`${box} font-pixel text-muted`} style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
