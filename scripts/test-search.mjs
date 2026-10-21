/**
 * Автотесты поиска: npm run test:search
 * Каждый сценарий — запрос и ожидания к результатам (id товаров из src/data/products.json).
 */
import { readFileSync } from 'node:fs';
import { createSearch, highlight } from '../src/lib/search-core.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'));
const engine = createSearch({
  products: load('products.json'),
  categories: load('categories.json'),
  synonyms: load('synonyms.json'),
});

const SERVELATS = ['servelat-finskiy', 'servelat-chesnochnyy', 'servelat-gusarskiy'];

/** top: должны быть в первых N результатах; has: должны быть найдены; not: не должны */
const cases = [
  { q: 'сервелат', top: SERVELATS },
  { q: 'серваелат', top: SERVELATS, note: 'опечатка' },
  { q: 'серв элат', top: SERVELATS, note: 'лишний пробел' },
  { q: 'сервилат', top: SERVELATS, note: 'опечатка' },
  { q: 'Копчёный', has: ['kurica-goryachego-kopcheniya', 'rebryshki-svinye'] },
  { q: 'копченая курица', top: ['kurica-goryachego-kopcheniya'], has: ['kurinye-krylyshki'], not: ['servelat-finskiy'] },
  { q: 'курочка', top: ['kurica-goryachego-kopcheniya'] },
  { q: 'куры', has: ['kurica-goryachego-kopcheniya'] },
  { q: 'чеснок', top: ['servelat-chesnochnyy'] },
  { q: 'грудка', has: ['kolbaski-italyanskie-s-syrom', 'karpachcho-iz-kurinoy-grudki'], not: ['grudinka-goryachego-kopcheniya', 'kolbaski-nyurnbergskie'] },
  { q: 'грудинка', top: ['grudinka-goryachego-kopcheniya'], not: ['karpachcho-iz-kurinoy-grudki'] },
  { q: 'перепел', has: ['pashtet-iz-perepelinoy-pecheni', 'pashtet-s-greckim-orehom', 'perepelinye-pechen-i-serdechki', 'myaso-perepela'] },
  { q: 'паштет', top: ['pashtet-iz-perepelinoy-pecheni', 'pashtet-s-greckim-orehom'], not: ['servelat-finskiy'] },
  { q: 'печёночный', has: ['pashtet-iz-perepelinoy-pecheni'] },
  { q: 'колбаски для жарки', top: ['kolbaski-nyurnbergskie', 'kolbaski-italyanskie-s-syrom'], not: ['kurica-goryachego-kopcheniya'] },
  { q: 'краковска', top: ['krakovskaya'] },
  { q: 'колбаса', has: ['krakovskaya', 'servelat-finskiy', 'vetchina-mramornaya'] },
  { q: 'карпачо', top: ['karpachcho-iz-kurinoy-grudki'], note: 'опечатка' },
  { q: 'ребра', top: ['rebryshki-svinye'] },
  { q: 'острое', top: ['servelat-gusarskiy'] },
  { q: 'пп', has: ['karpachcho-iz-kurinoy-grudki', 'myaso-perepela'] },
  { q: 'с', count: 0, note: 'одно стоп-слово' },
  { q: 'суши с лососем', count: 0, note: 'нет в каталоге' },
  { q: 'пицца', count: 0, note: 'нет в каталоге' },
];

let failed = 0;
for (const c of cases) {
  const res = engine.search(c.q);
  const ids = res.map((r) => r.id);
  const errors = [];
  if (c.top) {
    const head = ids.slice(0, c.top.length);
    for (const id of c.top) if (!head.includes(id)) errors.push(`нет в топ-${c.top.length}: ${id}`);
  }
  for (const id of c.has || []) if (!ids.includes(id)) errors.push(`не найден: ${id}`);
  for (const id of c.not || []) if (ids.includes(id)) errors.push(`лишний: ${id}`);
  if (c.count !== undefined && ids.length !== c.count) errors.push(`ожидалось ${c.count}, найдено ${ids.length}`);

  const mark = errors.length ? '✗' : '✓';
  if (errors.length) failed++;
  const first = res[0] ? highlight(res[0].product.name, res[0].terms) : '—';
  console.log(`${mark} «${c.q}»${c.note ? ` (${c.note})` : ''} → ${ids.length} шт.; первый: ${first}`);
  if (process.argv.includes('-v') || errors.length) console.log('    ' + ids.join(', '));
  for (const e of errors) console.log('    ! ' + e);
}

console.log(failed ? `\nПровалено: ${failed} из ${cases.length}` : `\nВсе ${cases.length} сценариев прошли`);
process.exit(failed ? 1 : 0);
