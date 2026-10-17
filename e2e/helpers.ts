import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import type { Download, Page } from '@playwright/test';

export async function unzipDownload(download: Download): Promise<JSZip> {
  const path = await download.path();
  return JSZip.loadAsync(await readFile(path));
}

/** 前往頁面並等待所有 Astro island 完成 hydration */
export async function gotoHydrated(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('astro-island[ssr]') === null);
}
