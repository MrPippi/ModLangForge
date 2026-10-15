/** 把字元點陣圖轉成 SVG path；每一列連續的同字元合併成一個矩形 */
export function bitmapToPath(rows: readonly string[], on: string): string {
  return rows
    .flatMap((row, y) => {
      const runs: string[] = [];
      let start = -1;
      for (let x = 0; x <= row.length; x += 1) {
        const filled = row[x] === on;
        if (filled && start < 0) start = x;
        if (!filled && start >= 0) {
          runs.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
          start = -1;
        }
      }
      return runs;
    })
    .join('');
}

/** 8×8 自繪草方塊 Logo（非 Mojang 素材）；字元對應顏色 */
export const LOGO_ROWS = ['GGLGGGLG', 'GGGGLGGG', 'GDGGGDGG', 'DdDDdDDD', 'DDDdDDdD', 'dDDDDDDd', 'DDdDDdDD', 'DDDDDdDD'] as const;
export const LOGO_COLORS: Readonly<Record<string, string>> = { G: '#5d9e3a', L: '#7cbd52', D: '#8a5a33', d: '#6f4527' };
