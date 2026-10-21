/**
 * Каталог и страница результатов поиска: фильтры, сортировка, поиск по месту.
 * Все карточки уже есть в HTML (это хорошо для SEO) — скрипт только скрывает,
 * сортирует и подсвечивает их. Состояние фильтров хранится в адресной строке.
 */
import { getEngine } from './data.js';
import { reportQuery, saveRecent } from './search-ui.js';
import { plural } from '../lib/format.js';

const SORTS = ['relevance', 'default', 'popular', 'new', 'price-asc', 'price-desc'];

function readUrl(mode) {
  const sp = new URLSearchParams(location.search);
  const num = (v) => (v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
  const q = (sp.get('q') || '').trim();
  let sort = sp.get('sort');
  if (!SORTS.includes(sort)) sort = q ? 'relevance' : mode === 'search' ? 'popular' : 'default';
  return {
    q,
    category: sp.get('category') || '',
    status: new Set((sp.get('status') || '').split(',').filter(Boolean)),
    min: num(sp.get('min')),
    max: num(sp.get('max')),
    sort,
    isNew: sp.get('new') === '1',
    noPork: sp.get('nopork') === '1',
  };
}

function writeUrl(s) {
  const sp = new URLSearchParams();
  if (s.q) sp.set('q', s.q);
  if (s.category) sp.set('category', s.category);
  if (s.status.size) sp.set('status', [...s.status].join(','));
  if (s.min != null) sp.set('min', s.min);
  if (s.max != null) sp.set('max', s.max);
  const defSort = s.q ? 'relevance' : 'default';
  if (s.sort && s.sort !== defSort) sp.set('sort', s.sort);
  if (s.isNew) sp.set('new', '1');
  if (s.noPork) sp.set('nopork', '1');
  const qs = sp.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
}

export function initListing(root) {
  const mode = root.dataset.mode;
  const grid = root.querySelector('[data-grid]');
  const cards = [...grid.querySelectorAll('.pcard')];
  const byId = new Map(cards.map((c) => [c.dataset.id, c]));
  const nameEl = new Map(cards.map((c) => [c.dataset.id, c.querySelector('[data-name]')]));
  const originalName = new Map(cards.map((c) => [c.dataset.id, nameEl.get(c.dataset.id).textContent]));

  const $ = (sel) => root.querySelector(sel);
  const countEl = $('[data-count]');
  const empty = $('[data-empty]');
  const emptyTitle = $('[data-empty-title]');
  const emptyText = $('[data-empty-text]');
  const sortSel = $('[data-sort]');
  const filters = $('[data-filters]');
  const filterCount = $('[data-filter-count]');
  const qInput = $('[data-listing-q]');
  const askLink = $('[data-ask]');

  const state = readUrl(mode);
  let seq = 0;

  /* ----- Синхронизация контролов с состоянием ----- */
  function syncControls() {
    root.querySelectorAll('[data-chip]').forEach((chip) => {
      const [k, v] = chip.dataset.chip.split(':');
      const on = k === 'category' ? state.category === v : k === 'new' ? state.isNew : k === 'nopork' ? state.noPork : false;
      chip.setAttribute('aria-pressed', String(on));
    });
    root.querySelectorAll('input[name="category"]').forEach((i) => {
      i.checked = i.value === state.category;
      i.closest('.chip')?.classList.toggle('is-active', i.checked);
    });
    root.querySelectorAll('input[name="status"]').forEach((i) => {
      i.checked = state.status.has(i.value);
      i.closest('.chip')?.classList.toggle('is-active', i.checked);
    });
    const minI = root.querySelector('input[name="min"]');
    const maxI = root.querySelector('input[name="max"]');
    if (minI && document.activeElement !== minI) minI.value = state.min ?? '';
    if (maxI && document.activeElement !== maxI) maxI.value = state.max ?? '';
    if (sortSel) {
      const rel = sortSel.querySelector('option[value="relevance"]');
      if (rel) rel.disabled = !state.q;
      sortSel.value = state.sort;
    }
    if (qInput && document.activeElement !== qInput) qInput.value = state.q;
    const active = (state.category ? 1 : 0) + state.status.size + (state.min != null || state.max != null ? 1 : 0) + (state.isNew ? 1 : 0) + (state.noPork ? 1 : 0);
    if (filterCount) filterCount.textContent = active ? String(active) : '';
  }

  /* ----- Главный расчёт ----- */
  async function apply() {
    const my = ++seq;
    let order = cards;
    let terms = null;

    if (state.q) {
      let ctx;
      try {
        ctx = await getEngine();
      } catch {
        countEl.textContent = 'Поиск временно недоступен';
        return;
      }
      if (my !== seq) return;
      const res = ctx.engine.search(state.q);
      terms = new Map(res.map((r) => [r.id, r.terms]));
      order = res.map((r) => byId.get(r.id)).filter(Boolean);
      // подсветка совпадений в названиях
      for (const c of cards) {
        const id = c.dataset.id;
        nameEl.get(id).innerHTML = terms.has(id) ? ctx.core.highlight(originalName.get(id), terms.get(id)) : originalName.get(id);
      }
    } else {
      for (const c of cards) nameEl.get(c.dataset.id).textContent = originalName.get(c.dataset.id);
    }

    const price = (c) => (c.dataset.price === '' ? null : Number(c.dataset.price));
    let visible = order.filter((c) => {
      if (state.category && c.dataset.category !== state.category) return false;
      if (state.status.size && !state.status.has(c.dataset.status)) return false;
      if (state.isNew && !c.dataset.new) return false;
      if (state.noPork && !c.dataset.nopork) return false;
      if (state.min != null || state.max != null) {
        const p = price(c);
        if (p == null) return false;
        if (state.min != null && p < state.min) return false;
        if (state.max != null && p > state.max) return false;
      }
      return true;
    });

    const pop = (c) => Number(c.dataset.popularity || 0);
    const sorters = {
      popular: (a, b) => pop(b) - pop(a),
      new: (a, b) => (b.dataset.new ? 1 : 0) - (a.dataset.new ? 1 : 0) || pop(b) - pop(a),
      'price-asc': (a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity),
      'price-desc': (a, b) => (price(b) ?? -Infinity) - (price(a) ?? -Infinity),
    };
    if (sorters[state.sort]) visible = [...visible].sort(sorters[state.sort]);

    const shown = new Set(visible);
    for (const c of cards) c.hidden = !shown.has(c);
    grid.append(...visible, ...cards.filter((c) => !shown.has(c)));

    const n = visible.length;
    countEl.textContent = state.q
      ? `По запросу «${state.q}» ${plural(n, 'найден', 'найдено', 'найдено')} ${n} ${plural(n, 'товар', 'товара', 'товаров')}`
      : `${n} ${plural(n, 'товар', 'товара', 'товаров')}`;

    empty.hidden = n > 0;
    if (!n) {
      const noMatches = state.q && order.length === 0;
      emptyTitle.textContent = noMatches ? `Ничего не нашлось по запросу «${state.q}»` : 'Под эти фильтры ничего нет';
      emptyText.textContent = noMatches
        ? 'Попробуйте «колбаса», «курица» или «паштет» — или спросите меня в Telegram, возможно, сделаю под заказ.'
        : 'Попробуйте ослабить фильтры или сбросить их.';
      if (askLink) askLink.href = `https://t.me/${askLink.dataset.user}?text=${encodeURIComponent(state.q ? `Здравствуйте! Есть ли у вас «${state.q}»?` : 'Здравствуйте! Подскажите по ассортименту.')}`;
    }
    if (state.q) reportQuery(state.q, order.length);

    writeUrl(state);
    syncControls();
    document.documentElement.classList.remove('is-pending');
  }

  /* ----- События ----- */
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const [k, v] = chip.dataset.chip.split(':');
      if (k === 'category') state.category = state.category === v ? '' : v;
      if (k === 'new') state.isNew = !state.isNew;
      if (k === 'nopork') state.noPork = !state.noPork;
      apply();
    }
    if (e.target.closest('[data-reset]')) {
      Object.assign(state, { category: '', status: new Set(), min: null, max: null, isNew: false, noPork: false });
      apply();
    }
    if (e.target.closest('[data-filters-toggle]')) {
      const btn = e.target.closest('[data-filters-toggle]');
      filters.hidden = !filters.hidden;
      btn.setAttribute('aria-expanded', String(!filters.hidden));
    }
    if (e.target.closest('[data-filters-close]')) {
      filters.hidden = true;
      root.querySelector('[data-filters-toggle]')?.setAttribute('aria-expanded', 'false');
      grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const q = e.target.closest('[data-set-q]');
    if (q) {
      state.q = q.dataset.setQ;
      state.sort = 'relevance';
      apply();
    }
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'category') state.category = t.value;
    else if (t.name === 'status') t.checked ? state.status.add(t.value) : state.status.delete(t.value);
    else if (t.matches('[data-sort]')) state.sort = t.value;
    else return;
    apply();
  });

  let priceTimer;
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name === 'min' || t.name === 'max') {
      clearTimeout(priceTimer);
      priceTimer = setTimeout(() => {
        const v = t.value === '' ? null : Math.max(0, Number(t.value));
        state[t.name] = Number.isNaN(v) ? null : v;
        apply();
      }, 300);
    }
  });

  if (qInput) {
    let qTimer;
    qInput.addEventListener('input', () => {
      clearTimeout(qTimer);
      qTimer = setTimeout(() => {
        const had = !!state.q;
        state.q = qInput.value.trim();
        if (state.q && (!had || state.sort === 'default' || state.sort === 'popular')) state.sort = 'relevance';
        if (!state.q && state.sort === 'relevance') state.sort = 'popular';
        apply();
      }, 200);
    });
    qInput.closest('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      state.q = qInput.value.trim();
      saveRecent(state.q);
      qInput.blur();
      apply();
    });
  }

  apply();
}
