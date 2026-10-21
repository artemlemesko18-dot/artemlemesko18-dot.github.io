/**
 * Линейные силуэты продуктов для плейсхолдеров, пока нет фото.
 * Ключ берётся из поля "icon" товара в products.json.
 */
const S = {
  // Колбаса колечком
  ring: `<ellipse cx="60" cy="66" rx="38" ry="28"/><ellipse cx="60" cy="66" rx="20" ry="12"/><path d="M27 52c6-9 18-14 33-14m33 14c-6-9-18-14-33-14"/><path d="M55 38c-3-7 0-13 5-15m0 0c5 2 8 8 5 15"/><path d="M44 70h0m14 8h0m18-6h0m-30-14h0m30 1h0" stroke-width="5"/>`,
  // Батончик сервелата и ломтики
  stick: `<path d="M18 74 86 36a13 13 0 0 1 13 22L31 96a13 13 0 0 1-13-22Z"/><path d="M95 33l7-6m-84 72-7 6"/><path d="M40 70h0m14-8h0m14-8h0m-24 22h0m14-8h0m14-8h0" stroke-width="5"/><circle cx="94" cy="88" r="12"/><circle cx="91" cy="86" r="1.5"/><circle cx="97" cy="91" r="1.5"/>`,
  // Колбаски для жарки
  links: `<rect x="14" y="36" width="70" height="17" rx="8.5" transform="rotate(-8 49 44)"/><rect x="24" y="55" width="72" height="17" rx="8.5" transform="rotate(-4 60 63)"/><rect x="34" y="75" width="70" height="17" rx="8.5" transform="rotate(4 69 83)"/><path d="M28 42l12-2m-2 23 12-1m-1 22 12 1" opacity=".6"/>`,
  // Целая курица
  chicken: `<path d="M24 72c0-20 18-34 40-34 20 0 32 12 32 26 0 16-15 28-38 28H42c-10 0-18-8-18-20Z"/><path d="M90 50l11-9m0 0a5 5 0 1 1 6 6l-8 4"/><path d="M88 80l12 6m0 0a5 5 0 1 0 2 7l-6-4"/><path d="M40 56c6-6 16-9 26-8m-30 22c8 6 22 8 34 4" opacity=".6"/>`,
  // Свиные рёбрышки
  ribs: `<path d="M16 58c0-12 10-20 22-20h44c12 0 22 8 22 20v10c0 12-10 20-22 20H38c-12 0-22-8-22-20Z"/><path d="M36 38v50m16-50v50m16-50v50m16-50v50"/><path d="M32 30l6 8m14-8 0 8m16-8v8m16-8-2 8"/>`,
  // Крылышко
  wing: `<path d="M34 86c-14-12-10-36 8-46 18-9 40-7 48 6 8 14-1 32-20 38-14 5-28 9-36 2Z"/><path d="M34 86l-12 12m0 0a5 5 0 1 0-4-7m4 7a5 5 0 1 1 7 4"/><path d="M50 56c10-4 22-3 30 4m-34 14c10 0 20-3 28-9" opacity=".6"/>`,
  // Карбонат, ветчина, грудинка — кусок с прослойками
  slab: `<path d="M16 70c0-16 10-28 28-30l44-4c12-1 18 7 18 18v18c0 10-6 16-16 16H34c-11 0-18-8-18-18Z"/><path d="M18 64c22-4 50-8 86-10m-86 22c24-2 52-4 86-6" opacity=".6"/><path d="M100 40c3-5 9-6 12-2" />`,
  // Карпаччо — тонкие ломтики веером
  slices: `<ellipse cx="44" cy="70" rx="26" ry="16" transform="rotate(-20 44 70)"/><ellipse cx="62" cy="60" rx="26" ry="16" transform="rotate(-5 62 60)"/><ellipse cx="80" cy="66" rx="26" ry="16" transform="rotate(14 80 66)"/><path d="M70 58c6 0 12 3 16 8m-36-4c4-4 10-6 16-5" opacity=".6"/><path d="M30 34c4 6 10 8 16 6M88 30c-2 6 0 12 6 14" opacity=".7"/>`,
  // Паштет в баночке
  jar: `<rect x="32" y="44" width="56" height="52" rx="12"/><rect x="28" y="30" width="64" height="16" rx="5"/><path d="M42 66h36m-36 12h24" opacity=".6"/><path d="M28 38h64" opacity=".5"/>`,
  // Печень и сердечки
  hearts: `<path d="M44 92S20 76 20 58a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 18-24 34-24 34Z"/><path d="M80 74S64 64 64 52a9 9 0 0 1 16-4 9 9 0 0 1 16 4c0 12-16 22-16 22Z"/><path d="M84 30c6 4 8 10 6 16" opacity=".6"/>`,
  // Перепел
  quail: `<path d="M26 74c0-18 16-30 36-30 8 0 14 2 18 6l10-6c6-3 12 2 10 8l-6 10c2 4 2 8 2 12 0 14-14 22-34 22S26 88 26 74Z"/><circle cx="88" cy="56" r="1.8"/><path d="M80 44c-2-8 2-14 8-16m-8 16c2-6 6-9 10-10"/><path d="M26 74l-10-4m10 8-8 4"/><path d="M44 76c8 4 20 4 28-2" opacity=".6"/><path d="M50 100v8m14-8v8"/>`,
};

/** SVG-силуэт по ключу; неизвестный ключ → батончик. */
export function silhouette(key, extraClass = '') {
  const body = S[key] || S.stick;
  return `<svg class="silhouette ${extraClass}" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Тёплые оттенки фона плейсхолдера по категории */
export const TINT = {
  kolbasy: 'tint-ember',
  'dlya-zharki': 'tint-copper',
  'goryachee-kopchenie': 'tint-amber',
  pashtety: 'tint-olive',
  perepel: 'tint-smoke',
};
