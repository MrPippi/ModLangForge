import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { isSitemapPage } from './src/lib/siteMeta.ts';

const SITE_URL = process.env.SITE_URL ?? 'https://modlangforge.pages.dev';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [react(), sitemap({ filter: isSitemapPage })],
  vite: { plugins: [tailwindcss()] },
});
