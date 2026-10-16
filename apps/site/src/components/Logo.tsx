import { useId } from 'react';
import { ANVIL_PATH, ANVIL_TOP_PATH, squareViewBox, tightViewBox, WEN_RECTS, WEN_STROKE_WIDTH, WEN_STROKES, WEN_TRANSFORM } from './logoGeometry';

const SQUARE = squareViewBox();
const WIDE = tightViewBox();

interface LogoProps {
  /** 高度（px）；wide 時寬度依鐵砧比例 */
  readonly size?: number;
  /** wide：貼合鐵砧的寬版，適合與站名並排；square：正方形畫框 */
  readonly shape?: 'wide' | 'square';
  readonly className?: string;
}

/** 站台標誌：鐵砧剪影＋鏤空「文」，顏色跟隨 currentColor；裝飾用，名稱由旁邊的站名提供 */
export function Logo({ size = 32, shape = 'wide', className = '' }: LogoProps) {
  const maskId = `mlf-logo-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  return (
    <svg aria-hidden="true" focusable="false" width={shape === 'wide' ? Math.round(size * WIDE.ratio) : size} height={size} viewBox={shape === 'wide' ? WIDE.viewBox : SQUARE} className={`shrink-0 ${className}`}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
          <rect width="120" height="120" fill="#fff" />
          <g transform={WEN_TRANSFORM} fill="#000" stroke="#000">
            {WEN_RECTS.map((r) => <rect key={r.y} {...r} />)}
            {WEN_STROKES.map((d) => <path key={d} d={d} fill="none" strokeWidth={WEN_STROKE_WIDTH} strokeLinecap="round" />)}
          </g>
        </mask>
      </defs>
      <path d={ANVIL_PATH} fill="currentColor" mask={`url(#${maskId})`} />
      <path d={ANVIL_TOP_PATH} fill="#fff" opacity="0.22" />
    </svg>
  );
}
