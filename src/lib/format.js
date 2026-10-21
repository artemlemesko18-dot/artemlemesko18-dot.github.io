/** Общие функции форматирования — используются и при сборке страниц, и в браузере. */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export const STATUS = {
  in_stock: { label: 'В наличии', tone: 'ok', schema: 'https://schema.org/InStock' },
  soon: { label: 'Будет к дате', tone: 'soon', schema: 'https://schema.org/PreOrder' },
  preorder: { label: 'Под заказ', tone: 'order', schema: 'https://schema.org/PreOrder' },
};

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «2026-10-31» → «31 октября» */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

export function statusLabel(p) {
  const s = STATUS[p.status] || STATUS.preorder;
  if (p.status === 'soon' && p.statusDate) return `Будет ${formatDate(p.statusDate)}`;
  return s.label;
}

export const statusTone = (p) => (STATUS[p.status] || STATUS.preorder).tone;

export const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

/** «950 ₽/кг», «200 ₽», «Цена по запросу» */
export function priceText(p) {
  if (p.price == null) return 'Цена по запросу';
  return p.priceUnit === 'kg' ? `${rub(p.price)}/кг` : rub(p.price);
}

/** Средний вес одной штуки в кг (для товаров «за кг», продающихся штуками). */
export function avgKg(p) {
  if (!p.weight || !p.weight.max) return null;
  const min = p.weight.min || p.weight.max;
  return (min + p.weight.max) / 2 / 1000;
}

/** Шаг количества в корзине: штуки — по 1, развесные — по 0,5 кг. */
export const qtyStep = (p) => (p.sellBy === 'weight' ? 0.5 : 1);

export function qtyText(p, qty) {
  if (p.sellBy === 'weight') return `${String(qty).replace('.', ',')} кг`;
  return `${qty} ${p.unitLabel === 'шт' ? 'шт.' : shortUnit(p.unitLabel)}`;
}

function shortUnit(u = '') {
  const map = { 'батончик': 'бат.', 'колечко': 'кол.', 'упаковка': 'уп.', 'тушка': 'туш.', 'кусок': 'кус.', 'батон': 'бат.' };
  return map[u] || u;
}

/** Примерная стоимость позиции или null, если цена неизвестна. */
export function lineEstimate(p, qty) {
  if (p.price == null) return null;
  if (p.priceUnit === 'pcs') return p.price * qty;
  if (p.sellBy === 'weight') return p.price * qty;
  const kg = avgKg(p);
  return kg ? p.price * kg * qty : null;
}

/** Нужна ли пометка «вес примерный» */
export const isWeighed = (p) => p.priceUnit === 'kg';

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
