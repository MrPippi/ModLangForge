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
  security: {
    // 以雜湊放行 Astro 產生的內嵌腳本；Pagefind 需要 wasm-unsafe-eval，React 的 style 屬性需要 style-src-attr；Turnstile 需放行 challenges.cloudflare.com
    csp: {
      scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'", 'https://challenges.cloudflare.com'] },
      styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }] },
      directives: ['frame-src https://challenges.cloudflare.com'],
    },
  },
});
