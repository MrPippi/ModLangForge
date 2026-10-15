/**
 * ModLangForge 標誌幾何（自繪，非字型、非 Mojang 素材）：鐵砧剪影＋砧身鏤空的「文」。
 * 網站 Logo 元件與 scripts/build-brand.ts 產生的 favicon／PNG 共用這份資料，修改後需重跑 `npm run brand:build`。
 * 座標系為 120×120。
 */

/** 鐵砧外框；外接框 x 6–113、y 49–98 */
export const ANVIL_PATH =
  'M6 54C16 54 24 51 32 49H109Q113 49 113 53V61Q113 64 110 64H96C90 66 86 71 85 78V84H95Q98 84 98 87V95Q98 98 95 98H33Q30 98 30 95V87Q30 84 33 84H43V78C42 71 38 66 32 64H28C18 63 10 59 6 54Z';

/** 砧面高光（疊在鐵砧上方，半透明白色） */
export const ANVIL_TOP_PATH = 'M14 53.5C20 53 26 51 32 49H109Q113 49 113 53V54H32C26 55 20 54 14 53.5Z';

export const ANVIL_BOUNDS = { minX: 6, minY: 49, maxX: 113, maxY: 98 } as const;

/** 「文」在 100×100 局部座標中的筆畫；撇、捺以圓頭描邊繪製 */
export const WEN_RECTS = [
  { x: 44, y: 2, width: 12, height: 18, rx: 5 },
  { x: 8, y: 25, width: 84, height: 11, rx: 4 },
] as const;
export const WEN_STROKES = ['M69 43Q58 75 14 95', 'M31 43Q44 78 90 95'] as const;
export const WEN_STROKE_WIDTH = 12;
/** 含圓頭描邊後的「文」外接框（局部座標） */
const WEN_BOUNDS = { minX: 8, minY: 2, maxX: 96, maxY: 101 } as const;

/** 「文」中心點：砧身（腰部到底座）中心 y 81 往上 4.5，視覺上下留白較平衡 */
const WEN_SCALE = 0.27;
const WEN_CENTER = { x: 64, y: 76.5 } as const;
const WEN_TX = WEN_CENTER.x - ((WEN_BOUNDS.minX + WEN_BOUNDS.maxX) / 2) * WEN_SCALE;
const WEN_TY = WEN_CENTER.y - ((WEN_BOUNDS.minY + WEN_BOUNDS.maxY) / 2) * WEN_SCALE;
export const WEN_TRANSFORM = `translate(${WEN_TX.toFixed(2)} ${WEN_TY.toFixed(2)}) scale(${WEN_SCALE})`;

/** 以鐵砧外接框為中心的正方形 viewBox，padding 為每邊留白 */
export function squareViewBox(padding = 2.5): string {
  const { minX, minY, maxX, maxY } = ANVIL_BOUNDS;
  const side = Math.max(maxX - minX, maxY - minY) + padding * 2;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return `${cx - side / 2} ${cy - side / 2} ${side} ${side}`;
}

/** 貼合鐵砧外接框的寬版 viewBox（用於與站名並排）；回傳 viewBox 與寬高比 */
export function tightViewBox(padding = 1.5): { readonly viewBox: string; readonly ratio: number } {
  const { minX, minY, maxX, maxY } = ANVIL_BOUNDS;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  return { viewBox: `${minX - padding} ${minY - padding} ${width} ${height}`, ratio: width / height };
}

/** 把鐵砧置中放進 120×120 圖示時的 transform；widthRatio 為鐵砧寬度占圖示寬度的比例 */
export function iconTransform(widthRatio = 0.74): string {
  const { minX, minY, maxX, maxY } = ANVIL_BOUNDS;
  const scale = (120 * widthRatio) / (maxX - minX);
  const tx = 60 - ((minX + maxX) / 2) * scale;
  const ty = 60 - ((minY + maxY) / 2) * scale;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`;
}
