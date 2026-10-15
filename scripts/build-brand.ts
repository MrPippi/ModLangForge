/**
 * 由 logoGeometry 產生品牌素材，並檢查標誌在畫布中是否置中：
 *   apps/site/public/favicon.svg            綠底圓角 App 圖示
 *   apps/site/public/brand/logo-{dark,light}.svg、icon.svg
 *   apps/site/public/brand/*.png            透明背景標誌與 App 圖示（多種尺寸）
 * 用法：npm run brand:build
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import {
  ANVIL_PATH, ANVIL_TOP_PATH, iconTransform, squareViewBox, WEN_RECTS, WEN_STROKE_WIDTH, WEN_STROKES, WEN_TRANSFORM,
} from '../apps/site/src/components/logoGeometry';

const PUBLIC_DIR = resolve(import.meta.dirname, '..', 'apps', 'site', 'public');
const BRAND_DIR = join(PUBLIC_DIR, 'brand');
const BRAND_GREEN = '#2f6421';
const INK_DARK = '#1f1d1a';
const INK_LIGHT = '#ecebe4';
const CENTER_TOLERANCE_PX = 1;

const wen = [
  ...WEN_RECTS.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}"/>`),
  ...WEN_STROKES.map((d) => `<path d="${d}" fill="none" stroke-width="${WEN_STROKE_WIDTH}" stroke-linecap="round"/>`),
].join('');

function anvil(ink: string): string {
  return `<defs><mask id="w" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120"><rect width="120" height="120" fill="#fff"/><g transform="${WEN_TRANSFORM}" fill="#000" stroke="#000">${wen}</g></mask></defs>`
    + `<path d="${ANVIL_PATH}" fill="${ink}" mask="url(#w)"/><path d="${ANVIL_TOP_PATH}" fill="#fff" opacity="0.22"/>`;
}

const markSvg = (ink: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${squareViewBox()}">${anvil(ink)}</svg>\n`;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="28" fill="${BRAND_GREEN}"/><g transform="${iconTransform()}">${anvil('#fffefb')}</g></svg>\n`;

interface Bounds { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }

/** 在瀏覽器中把 SVG 畫到畫布並回傳 PNG 與「前景」像素的外接框 */
async function render(page: import('@playwright/test').Page, svg: string, size: number, foreground: 'alpha' | 'light') {
  return page.evaluate(async ({ svg, size, foreground }) => {
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let minX = size; let minY = size; let maxX = -1; let maxY = -1;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        const hit = foreground === 'alpha' ? data[i + 3]! > 8 : data[i]! > 200 && data[i + 1]! > 200 && data[i + 2]! > 200 && data[i + 3]! > 200;
        if (hit) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
      }
    }
    return { png: canvas.toDataURL('image/png').split(',')[1]!, bounds: { minX, minY, maxX, maxY } };
  }, { svg, size, foreground });
}

function centerOffset(b: Bounds, size: number): { dx: number; dy: number } {
  return { dx: (b.minX + b.maxX + 1) / 2 - size / 2, dy: (b.minY + b.maxY + 1) / 2 - size / 2 };
}

async function main(): Promise<void> {
  mkdirSync(BRAND_DIR, { recursive: true });
  writeFileSync(join(PUBLIC_DIR, 'favicon.svg'), iconSvg);
  writeFileSync(join(BRAND_DIR, 'icon.svg'), iconSvg);
  writeFileSync(join(BRAND_DIR, 'logo-dark.svg'), markSvg(INK_DARK));
  writeFileSync(join(BRAND_DIR, 'logo-light.svg'), markSvg(INK_LIGHT));

  const jobs = [
    { file: 'icon-180.png', svg: iconSvg, size: 180, fg: 'light' as const },
    { file: 'icon-512.png', svg: iconSvg, size: 512, fg: 'light' as const },
    { file: 'icon-1024.png', svg: iconSvg, size: 1024, fg: 'light' as const },
    { file: 'logo-dark-512.png', svg: markSvg(INK_DARK), size: 512, fg: 'alpha' as const },
    { file: 'logo-dark-1024.png', svg: markSvg(INK_DARK), size: 1024, fg: 'alpha' as const },
    { file: 'logo-light-1024.png', svg: markSvg(INK_LIGHT), size: 1024, fg: 'alpha' as const },
  ];

  const browser = await chromium.launch();
  let failed = false;
  try {
    const page = await browser.newPage();
    for (const job of jobs) {
      const { png, bounds } = await render(page, job.svg, job.size, job.fg);
      writeFileSync(join(BRAND_DIR, job.file), Buffer.from(png, 'base64'));
      const { dx, dy } = centerOffset(bounds, job.size);
      const ok = Math.abs(dx) <= CENTER_TOLERANCE_PX && Math.abs(dy) <= CENTER_TOLERANCE_PX;
      if (!ok) failed = true;
      console.log(`${ok ? 'OK ' : 'OFF'} ${job.file.padEnd(20)} 標誌中心偏移 x ${dx.toFixed(1)}px, y ${dy.toFixed(1)}px`);
    }
  } finally {
    await browser.close();
  }
  if (failed) {
    console.error(`有素材偏離中心超過 ${CENTER_TOLERANCE_PX}px`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('build-brand 執行失敗', err);
  process.exitCode = 1;
});
