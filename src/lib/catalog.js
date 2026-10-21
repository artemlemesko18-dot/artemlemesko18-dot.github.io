/** Доступ к данным каталога во время сборки страниц. */
import products from '../data/products.json';
import categories from '../data/categories.json';
import site from '../data/site.json';
import synonyms from '../data/synonyms.json';

export { products, categories, site, synonyms };

export const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
export const productById = Object.fromEntries(products.map((p) => [p.id, p]));

export const pick = (ids = []) => ids.map((id) => productById[id]).filter(Boolean);

export const productUrl = (p) => `/catalog/${p.id}`;
export const categoryUrl = (c) => `/catalog?category=${c.id}`;

export function relatedOf(p) {
  const list = pick(p.related);
  // если связанных мало — добавляем из той же категории
  for (const other of products) {
    if (list.length >= 4) break;
    if (other.id !== p.id && other.category === p.category && !list.includes(other)) list.push(other);
  }
  return list.slice(0, 4);
}

/** Плейсхолдер вида «[УКАЗАТЬ]» — значение ещё не заполнено владельцем */
export const isFilled = (v) => !!v && !/^\[.*\]$/.test(String(v).trim());

export const absUrl = (path) => new URL(path, import.meta.env.SITE || site.url).href;

/** Статический хостинг (GitHub Pages): сервера нет, заявки уходят прямо в Telegram */
export const isStatic = process.env.STATIC_HOSTING === '1';

/** Данные для браузера: корзина и поиск. Отдаются файлом /catalog-data.json */
export function clientData() {
  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      short: p.short,
      description: p.description,
      composition: p.composition,
      tags: p.tags,
      price: p.price,
      priceUnit: p.priceUnit,
      sellBy: p.sellBy,
      unitLabel: p.unitLabel,
      weight: p.weight,
      weightText: p.weightText,
      status: p.status,
      statusDate: p.statusDate,
      image: p.image,
      icon: p.icon,
      isNew: p.isNew,
      isHit: p.isHit,
      noPork: p.noPork,
      popularity: p.popularity,
    })),
    categories: categories.map(({ id, name, tags }) => ({ id, name, tags })),
    synonyms: { groups: synonyms.groups, oneWay: synonyms.oneWay },
    popular: site.popular,
    popularQueries: site.popularQueries,
    telegramUser: site.telegramUser,
  };
}
