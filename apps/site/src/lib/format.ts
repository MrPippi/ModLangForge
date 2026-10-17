import type { CatalogMod, SourceVersion } from '@mlf/core/catalog';
import { SITE_SHORT_NAME } from './config';
import type { SummaryStatus } from './summary';

export const STATUS_LABELS: Readonly<Record<SummaryStatus, string>> = {
  machine: '機器翻譯・待校對',
  partial: '部分校對',
  reviewed: '已校對',
  builtin: '內建繁中',
};

export const LOADER_LABELS: Readonly<Record<CatalogMod['loaders'][number], string>> = {
  forge: 'Forge',
  neoforge: 'NeoForge',
  fabric: 'Fabric',
  quilt: 'Quilt',
};

export function formatSourceVersion(v: Pick<SourceVersion, 'modVersion' | 'mcVersion' | 'loader'>): string {
  return [v.mcVersion, LOADER_LABELS[v.loader], v.modVersion].filter((part) => part !== undefined).join(' · ');
}

export function displayName(meta: { readonly name: string; readonly nameZh?: string | null }): string {
  return meta.nameZh ? `${meta.name}（${meta.nameZh}）` : meta.name;
}

export function modPageTitle(meta: Pick<CatalogMod, 'name' | 'nameZh'>): string {
  return `${displayName(meta)} 繁體中文翻譯下載 | ${SITE_SHORT_NAME}`;
}

export function modPageDescription(meta: Pick<CatalogMod, 'name' | 'nameZh' | 'summary' | 'mcVersions'>, percent: number): string {
  return `${displayName(meta)} 繁體中文語言包，完成度 ${percent}%，支援 Minecraft ${meta.mcVersions.join('、')}。${meta.summary}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${y} 年 ${Number(m)} 月 ${Number(d)} 日` : iso;
}

export function formatPercent(percent: number): string {
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}

const WAN = 10_000;
const YI = 100_000_000;

/** < 1 萬完整數字；< 1 億「N 萬」；≥ 1 億「X.Y 億」 */
export function formatDownloads(n: number): string {
  if (n < WAN) return n.toLocaleString('en-US');
  if (n < YI) return `${Math.floor(n / WAN).toLocaleString('en-US')} 萬`;
  const yi = Math.floor((n / YI) * 10) / 10;
  return `${yi.toLocaleString('en-US', { maximumFractionDigits: 1 })} 億`;
}

/** 「9,840 萬次」「9,999 次」：萬／億後不加空白 */
export function downloadsValue(n: number): string {
  const text = formatDownloads(n);
  const joiner = text.endsWith('萬') || text.endsWith('億') ? '' : ' ';
  return `${text}${joiner}次`;
}

export function downloadsLabel(n: number): string {
  return `⬇ ${downloadsValue(n)}下載`;
}

/** 小標籤（載入器、Minecraft 版本等）的共用 class */
export const CHIP_CLASS = 'inline-flex items-center rounded-sm border border-line bg-surface px-2 py-0.5 text-xs text-muted';
