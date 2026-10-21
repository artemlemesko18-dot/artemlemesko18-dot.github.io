/**
 * Генерирует превью для соцсетей и мессенджеров (public/og.jpg, 1200×630)
 * и иконку для iOS (public/apple-touch-icon.png). Запуск: npm run og
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const site = JSON.parse(readFileSync(new URL('../src/data/site.json', import.meta.url), 'utf8'));
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const mark = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="1" y="1" width="38" height="38" rx="12" fill="url(#g)"/>
    <g stroke="#1A0F08" stroke-width="2.2" stroke-linecap="round" fill="none">
      <path d="M13.5 26c-2.6-2.4-1.2-4.6.4-6.4 1.6-1.8 2.4-4-.2-6.4"/>
      <path d="M20 26c-2.6-2.4-1.2-4.6.4-6.4 1.6-1.8 2.4-4-.2-6.4" opacity=".85"/>
      <path d="M26.5 26c-2.6-2.4-1.2-4.6.4-6.4" opacity=".7"/>
      <path d="M10.5 30.5h19"/>
    </g>
  </g>`;

const og = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#E7A050"/><stop offset="1" stop-color="#C4643A"/></linearGradient>
    <radialGradient id="glow" cx="0.8" cy="0.7" r="0.6"><stop offset="0" stop-color="#D8803C" stop-opacity=".45"/><stop offset="1" stop-color="#D8803C" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2" cx="0.1" cy="0.1" r="0.6"><stop offset="0" stop-color="#5A4434" stop-opacity=".6"/><stop offset="1" stop-color="#5A4434" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#14100E"/>
  <rect width="1200" height="630" fill="url(#glow2)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g fill="none" stroke="#E8A35A" stroke-opacity=".55" stroke-width="3" stroke-linecap="round" transform="translate(800 300) scale(.55)">
    <ellipse cx="300" cy="380" rx="120" ry="74" transform="rotate(-14 300 380)"/>
    <ellipse cx="300" cy="380" rx="66" ry="36" transform="rotate(-14 300 380)"/>
    <path d="M380 300 600 190a34 34 0 0 1 32 60L412 360a34 34 0 0 1-32-60Z"/>
    <circle cx="560" cy="380" r="40"/><circle cx="610" cy="420" r="40"/>
    <path d="M180 250c80-30 150-90 210-170"/>
  </g>
  ${mark(80, 70, 1.9)}
  <text x="166" y="128" font-family="Georgia, 'Times New Roman', serif" font-size="40" font-weight="700" fill="#F5EDE0">Вкус <tspan font-style="italic" font-weight="400" fill="#E8A35A">и</tspan> Дело</text>
  <text x="80" y="290" font-family="Georgia, 'Times New Roman', serif" font-size="68" font-weight="700" fill="#F5EDE0">Копчёности и крафтовые</text>
  <text x="80" y="370" font-family="Georgia, 'Times New Roman', serif" font-size="68" font-weight="700" fill="#F5EDE0">колбасы <tspan font-style="italic" font-weight="400" fill="#E8A35A">с характером</tspan></text>
  <text x="80" y="450" font-family="'Segoe UI', Arial, sans-serif" font-size="30" fill="#F5EDE0" fill-opacity=".75">Домашнее производство · ${site.city}</text>
  <rect x="80" y="500" width="330" height="62" rx="31" fill="url(#g)"/>
  <text x="245" y="541" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="26" font-weight="700" fill="#1A0F08">Заказать онлайн</text>
</svg>`;

const icon = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <defs><linearGradient id="g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#E7A050"/><stop offset="1" stop-color="#C4643A"/></linearGradient></defs>
  <rect width="180" height="180" fill="#14100E"/>
  ${mark(22, 22, 3.4)}
</svg>`;

await sharp(Buffer.from(og)).jpeg({ quality: 88, mozjpeg: true }).toFile(out('og.jpg'));
await sharp(Buffer.from(icon)).png().toFile(out('apple-touch-icon.png'));
console.log('Готово: public/og.jpg, public/apple-touch-icon.png');

