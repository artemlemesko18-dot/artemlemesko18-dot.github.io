import { products, absUrl, productUrl } from '../lib/catalog.js';

export function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const pages = [
    { path: '/', priority: '1.0', freq: 'daily' },
    { path: '/catalog', priority: '0.9', freq: 'daily' },
    ...products.map((p) => ({ path: productUrl(p), priority: '0.8', freq: 'weekly' })),
    { path: '/how-to-order', priority: '0.6', freq: 'monthly' },
    { path: '/about', priority: '0.5', freq: 'monthly' },
    { path: '/contacts', priority: '0.6', freq: 'monthly' },
    { path: '/privacy', priority: '0.2', freq: 'yearly' },
    { path: '/terms', priority: '0.2', freq: 'yearly' },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${absUrl(p.path)}</loc><lastmod>${today}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
