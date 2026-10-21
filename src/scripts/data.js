/** Данные каталога для браузера: грузятся один раз и кешируются в памяти. */
let dataPromise;
let enginePromise;
let dataReady = null;

/** Уже загруженные данные или null — для действий, которым нельзя ждать (открытие окна Telegram) */
export const peekData = () => dataReady;

/** Сайт размещён без сервера (GitHub Pages) */
export const isStaticSite = () => document.documentElement.dataset.static === '1';

export function loadData() {
  if (!dataPromise) {
    dataPromise = fetch('/catalog-data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        data.byId = Object.fromEntries(data.products.map((p) => [p.id, p]));
        dataReady = data;
        return data;
      })
      .catch((e) => {
        dataPromise = null;
        throw e;
      });
  }
  return dataPromise;
}

/** Поисковый движок: MiniSearch и словари подгружаются отдельным чанком при первом обращении. */
export function getEngine() {
  if (!enginePromise) {
    enginePromise = Promise.all([import('../lib/search-core.js'), loadData()])
      .then(([core, data]) => ({ core, data, engine: core.createSearch(data) }))
      .catch((e) => {
        enginePromise = null;
        throw e;
      });
  }
  return enginePromise;
}
