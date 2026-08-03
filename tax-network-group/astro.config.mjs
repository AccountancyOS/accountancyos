// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * Canonical host. PLACEHOLDER — confirm the production domain with the client
 * before launch (footer contact address implies `taxnetworkgroup.uk`).
 * Everything canonical, OG and sitemap-related derives from this value.
 */
const SITE = process.env.PUBLIC_SITE_URL || 'https://taxnetworkgroup.uk';

// URLs that must never appear in the sitemap (noindex / utility / legal).
const SITEMAP_EXCLUDE = [
  '/404/',
  '/login/',
  '/privacy/',
  '/terms/',
  '/regulatory/',
  '/cookies/',
  '/enquiry-received/',
];

export default defineConfig({
  site: SITE,
  trailingSlash: 'always',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !SITEMAP_EXCLUDE.some((excluded) => path === excluded);
      },
    }),
  ],
});
