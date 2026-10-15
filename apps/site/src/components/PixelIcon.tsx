import { bitmapToPath, ICONS, type IconName, LOGO_COLORS, LOGO_ROWS } from './pixelArt';

const ICON_PATHS = Object.fromEntries(Object.entries(ICONS).map(([name, rows]) => [name, bitmapToPath(rows, '#')])) as Record<IconName, string>;
const LOGO_PATHS = Object.entries(LOGO_COLORS).map(([ch, color]) => ({ color, d: bitmapToPath(LOGO_ROWS, ch) }));

interface PixelIconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly className?: string;
}

/** 裝飾用像素 icon，一律 aria-hidden；需要語意時由外層提供文字 */
export function PixelIcon({ name, size = 16, className = '' }: PixelIconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className={`shrink-0 fill-current ${className}`}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function PixelLogo({ size = 28 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges">
      {LOGO_PATHS.map((p) => <path key={p.color} d={p.d} fill={p.color} />)}
    </svg>
  );
}
