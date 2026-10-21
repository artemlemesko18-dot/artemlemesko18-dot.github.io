// Конфигурация Astro: статическая сборка в папку dist/
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';

const site = JSON.parse(readFileSync(new URL('./src/data/site.json', import.meta.url), 'utf8'));

export default defineConfig({
  // На GitHub Pages адрес подставляет сборка (SITE_URL), иначе берётся из site.json
  site: process.env.SITE_URL || site.url,
  // Админка собирает новую версию в отдельную папку и подменяет её без простоя
  outDir: process.env.ASTRO_OUT_DIR || './dist',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  compressHTML: true,
  devToolbar: { enabled: false },
});
