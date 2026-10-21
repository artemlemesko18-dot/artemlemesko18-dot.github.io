/**
 * Ядро поиска «Вкус и Дело». Работает одинаково в браузере и в Node (для тестов).
 *
 * Как это устроено:
 *  1. Текст нормализуется: нижний регистр, ё → е, только буквы и цифры.
 *  2. Каждое слово приводится к основе стеммером (колбаски → колбаск).
 *  3. Индекс MiniSearch строится по полям name, tags, category, composition, description
 *     с разным весом: совпадение в названии важнее, чем в описании.
 *  4. Каждое слово запроса расширяется синонимами из src/data/synonyms.json.
 *  5. Сначала ищем товары, где есть ВСЕ слова запроса (AND). Если пусто —
 *     пробуем склеить слова («серв элат» → «сервэлат»), затем ищем ЛЮБОЕ слово (OR).
 *  6. Опечатки прощаются нечётким поиском: 1 ошибка в словах из 5–7 букв, 2 — в длинных.
 */
import MiniSearch from 'minisearch';
import { stem } from './stem.js';
import { escapeHtml } from './format.js';

export { escapeHtml };

export const STOPWORDS = new Set([
  'и', 'в', 'во', 'на', 'с', 'со', 'из', 'для', 'по', 'к', 'ко', 'от', 'до', 'за', 'о', 'об',
  'а', 'но', 'или', 'же', 'ли', 'бы', 'без', 'под', 'при', 'шт', 'г', 'кг', 'гр', 'руб',
]);

export function normalize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function words(text = '') {
  const norm = normalize(text);
  return norm ? norm.split(' ') : [];
}

/** Основа слова для индекса; стоп-слова отбрасываются. */
export function termOf(word) {
  if (!word || STOPWORDS.has(word)) return null;
  return stem(word);
}

const FIELD_BOOST = { name: 8, tags: 4, category: 3, composition: 2, description: 1 };
const SYNONYM_BOOST = { name: 3.5, tags: 2, category: 1.5, composition: 1, description: 0.5 };

function fuzzyFor(term) {
  if (term.length >= 8) return 2;
  if (term.length >= 5) return 1;
  return false;
}

/** Синонимы → словарь «основа (или основы через пробел) → список вариантов из основ». */
function compileSynonyms(synonyms = {}) {
  const map = new Map();
  const toStems = (phrase) => words(phrase).map(termOf).filter(Boolean);
  const add = (key, variant) => {
    const k = toStems(key).join(' ');
    const v = toStems(variant);
    if (!k || !v.length || v.join(' ') === k) return;
    if (!map.has(k)) map.set(k, []);
    const list = map.get(k);
    if (!list.some((x) => x.join(' ') === v.join(' '))) list.push(v);
  };
  for (const group of synonyms.groups || []) {
    for (const a of group) for (const b of group) if (a !== b) add(a, b);
  }
  for (const [key, list] of Object.entries(synonyms.oneWay || {})) {
    for (const v of list) add(key, v);
  }
  return map;
}

/**
 * @param {{products: any[], categories: any[], synonyms?: any}} data
 */
export function createSearch({ products, categories, synonyms }) {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const byId = new Map(products.map((p) => [p.id, p]));
  const synonymMap = compileSynonyms(synonyms);
  const maxKeyWords = Math.max(1, ...[...synonymMap.keys()].map((k) => k.split(' ').length));

  const tokenize = (text) => words(text);
  const mini = new MiniSearch({
    idField: 'id',
    fields: ['name', 'tags', 'category', 'composition', 'description'],
    storeFields: [],
    tokenize,
    processTerm: termOf,
  });

  mini.addAll(
    products.map((p) => {
      const cat = catById.get(p.category);
      return {
        id: p.id,
        name: p.name,
        tags: [...(p.tags || []), ...(p.isNew ? ['новинка', 'новое'] : []), ...(p.isHit ? ['хит', 'популярное'] : [])].join(' '),
        category: cat ? [cat.name, ...(cat.tags || [])].join(' ') : '',
        composition: p.composition || '',
        description: [p.short, p.description].filter(Boolean).join(' '),
      };
    }),
  );

  // Строки в запросах ниже — уже готовые основы, второй раз их не обрабатываем
  const base = {
    tokenize: (s) => [s],
    processTerm: (s) => s,
    boost: FIELD_BOOST,
  };

  /** Разбивает запрос на «единицы»: слово или фраза из словаря синонимов. */
  function units(stems) {
    const out = [];
    for (let i = 0; i < stems.length; ) {
      let taken = 1;
      for (let n = Math.min(maxKeyWords, stems.length - i); n > 1; n--) {
        if (synonymMap.has(stems.slice(i, i + n).join(' '))) { taken = n; break; }
      }
      out.push(stems.slice(i, i + taken));
      i += taken;
    }
    return out;
  }

  function unitQuery(unit) {
    const key = unit.join(' ');
    const own = unit.length === 1
      ? { queries: [unit[0]], combineWith: 'OR', prefix: unit[0].length >= 2, fuzzy: fuzzyFor(unit[0]) }
      : { queries: unit, combineWith: 'AND', prefix: true, fuzzy: (t) => fuzzyFor(t) };
    const variants = synonymMap.get(key) || [];
    if (!variants.length) return own;
    return {
      combineWith: 'OR',
      queries: [
        own,
        ...variants.map((v) => ({ queries: v, combineWith: 'AND', prefix: true, fuzzy: false, boost: SYNONYM_BOOST })),
      ],
    };
  }

  function rank(results, normQuery, firstWord) {
    return results
      .map((r) => {
        const p = byId.get(r.id);
        const name = normalize(p.name);
        let score = r.score;
        if (name === normQuery) score *= 4;
        else if (name.startsWith(normQuery)) score *= 2.5;
        else if (firstWord && name.split(' ').some((w) => w.startsWith(firstWord))) score *= 1.6;
        return { id: r.id, score, terms: new Set(r.terms), product: p };
      })
      .sort((a, b) => b.score - a.score || (b.product.popularity || 0) - (a.product.popularity || 0));
  }

  /**
   * Главная функция поиска.
   * @returns {{ id: string, score: number, terms: Set<string>, product: any }[]}
   */
  function search(query) {
    const normQuery = normalize(query);
    const ws = words(query);
    const stems = ws.map(termOf).filter(Boolean);
    if (!stems.length) return [];

    const us = units(stems);
    const firstWord = ws.find((w) => !STOPWORDS.has(w)) || '';

    // 1. Все слова (с синонимами)
    let results = mini.search({ combineWith: 'AND', queries: us.map(unitQuery) }, base);

    // 2. Слова, разделённые пробелом по ошибке: «серв элат»
    if (!results.length && ws.length > 1) {
      const glued = stem(ws.join(''));
      results = mini.search({ queries: [glued], prefix: true, fuzzy: fuzzyFor(glued) }, base);
    }

    // 3. Хотя бы одно слово
    if (!results.length && us.length > 1) {
      results = mini.search({ combineWith: 'OR', queries: us.map(unitQuery) }, base);
    }

    return rank(results, normQuery, firstWord);
  }

  return { search, byId };
}

/**
 * Подсвечивает в тексте слова, основа которых совпала с найденными терминами.
 * Возвращает безопасный HTML.
 */
export function highlight(text = '', terms) {
  if (!terms || !terms.size) return escapeHtml(text);
  return String(text)
    .split(/([\p{L}\p{N}]+)/u)
    .map((part, i) => {
      if (i % 2 === 0) return escapeHtml(part);
      const t = termOf(normalize(part));
      return t && terms.has(t) ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part);
    })
    .join('');
}
