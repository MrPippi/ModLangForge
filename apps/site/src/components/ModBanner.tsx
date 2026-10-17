interface Props {
  readonly src: string | null;
  readonly name: string;
  /** 沒有橫幅圖時：pattern 顯示花紋底，none 不輸出 */
  readonly fallback: 'pattern' | 'none';
  readonly className?: string;
  /** 首屏的橫幅不延遲載入 */
  readonly eager?: boolean;
}

/** 模組橫幅；純裝飾，名稱已在旁邊顯示，所以圖片不加替代文字 */
export function ModBanner({ src, fallback, className = '', eager = false }: Props) {
  if (src) {
    return <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" className={`h-full w-full object-cover ${className}`.trim()} />;
  }
  if (fallback === 'none') return null;
  return <div aria-hidden="true" className={`banner-fallback h-full w-full ${className}`.trim()} />;
}
