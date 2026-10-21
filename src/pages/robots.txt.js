import { absUrl } from '../lib/catalog.js';

export function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /search

Clean-param: q&category&status&min&max&sort&new&nopork /catalog

Sitemap: ${absUrl('/sitemap.xml')}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
