import { bitmapToPath, LOGO_COLORS, LOGO_ROWS } from './pixelArt';

const LOGO_PATHS = Object.entries(LOGO_COLORS).map(([ch, color]) => ({ color, d: bitmapToPath(LOGO_ROWS, ch) }));

/** 自繪 8×8 草方塊 Logo（非 Mojang 素材），與 favicon 一致 */
export function PixelLogo({ size = 28 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges">
      {LOGO_PATHS.map((p) => <path key={p.color} d={p.d} fill={p.color} />)}
    </svg>
  );
}
