import type { CatalogMod, TranslationStatus } from '@mlf/core/catalog';
import { SITE_SHORT_NAME } from './config';

export const STATUS_LABELS: Readonly<Record<TranslationStatus, string>> = {
  machine: '機器翻譯・待校對',
  partial: '部分校對',
  reviewed: '已校對',
};

export const LOADER_LABELS: Readonly<Record<CatalogMod['loaders'][number], string>> = {
  forge: 'Forge',
  neoforge: 'NeoForge',
  fabric: 'Fabric',
  quilt: 'Quilt',
};

export function displayName(meta: Pick<CatalogMod, 'name' | 'nameZh'>): string {
  return meta.nameZh ? `${meta.name}（${meta.nameZh}）` : meta.name;
}

export function modPageTitle(meta: Pick<CatalogMod, 'name' | 'nameZh'>): string {
  return `${displayName(meta)}繁體中文翻譯下載 | ${SITE_SHORT_NAME}`;
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
