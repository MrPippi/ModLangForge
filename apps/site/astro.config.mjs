import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE_URL = process.env.SITE_URL ?? 'https://modlangforge.pages.dev';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [react(), sitemap()],
  vite: { plugins: [tailwindcss()] },
});
